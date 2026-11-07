import type { ProjectLocation } from "../storage/store.ts";
import type {
  Applies,
  CheckedRelation,
  CheckInput,
  CheckResult,
  DiscoverInput,
  DiscoverResult,
  Entry,
  Gap,
  Group,
  Ledger,
  RecordStanding,
  Seed,
  Selector,
} from "./model.ts";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  validateArray,
  validateMemoryScope,
  validateObject,
  validateText,
} from "../records/records.ts";
import { rankSourcesByQuery } from "../sources/search.ts";
import { bounds, originals, parseReference, parseSelector, readLedger, reject } from "./store.ts";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function atPosition(ledger: Ledger, at: CheckInput["at"]) {
  if (at === undefined || at === "current") return ledger.entries.length;
  if (!Number.isSafeInteger(at) || at < 0 || at > ledger.entries.length)
    reject("at must be an available ledger position");
  return at;
}

function normalizeSeeds(value: CheckInput["seeds"]): Seed[] {
  validateArray(value, "seeds");
  const seeds = value.map((seed) => {
    const selected = typeof seed === "string" ? { ref: seed } : seed;
    validateObject(selected, "seed");
    parseReference(selected.ref, true);
    return {
      ref: selected.ref,
      ...(selected.selector === undefined ? {} : { selector: parseSelector(selected.selector) }),
    };
  });
  const distinct = new Map(seeds.map((seed) => [JSON.stringify(seed), seed]));
  return [...distinct.values()].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

type Basis = {
  version: 1;
  component: "evidence";
  seeds: Seed[];
  at: number;
  coverage: "complete" | "partial";
  fingerprint: string;
};

function parseBasis(serialized: string): Basis {
  try {
    const value = JSON.parse(serialized) as Basis;
    validateObject(value, "basis");
    if (
      value.version !== 1 ||
      value.component !== "evidence" ||
      !Number.isSafeInteger(value.at) ||
      value.at < 0 ||
      !["complete", "partial"].includes(value.coverage)
    )
      reject("Unsupported evidence basis");
    normalizeSeeds(value.seeds);
    validateText(value.fingerprint, "basis.fingerprint");
    return value;
  } catch {
    reject("Invalid evidence basis; use the opaque value returned by checkChanges");
  }
}

export function basisFingerprint(basis: string) {
  return parseBasis(basis).fingerprint;
}

function overlaps(entry: Entry, left?: Selector, right?: Selector) {
  const a = bounds(entry, left);
  const b = bounds(entry, right);
  return a.start < b.end && b.start < a.end;
}

type Effect = { entry: Entry; applies: Applies; via: string[] };

function admittedEffects(entries: Entry[]) {
  const effects = new Map<string, Effect[]>();
  for (const entry of entries)
    if (entry.standing === "adopted")
      effects.set(entry.ref, [
        { entry, applies: entry.relation?.applies ?? entry.applies, via: [entry.ref] },
      ]);
  // Accepted corrections remain historical transitions even when their source is
  // subsequently withdrawn. A withdrawal does not roll the target back.
  for (let changed = true; changed;) {
    changed = false;
    for (const event of entries) {
      if (event.relation?.type !== "adopts") continue;
      const target = entries.find(({ ref }) => ref === event.relation!.target);
      if (!target || target.standing === "adopted") continue;
      for (const effect of effects.get(event.ref) ?? []) {
        const adopted = effects.get(target.ref) ?? [];
        const via = [...effect.via, target.ref];
        if (
          adopted.some(
            (prior) =>
              isDeepStrictEqual(prior.applies, effect.applies) && isDeepStrictEqual(prior.via, via),
          )
        )
          continue;
        adopted.push({ entry: target, applies: effect.applies, via });
        effects.set(target.ref, adopted);
        changed = true;
      }
    }
  }
  return effects;
}

function standingFor(
  entry: Entry,
  selectors: (Selector | undefined)[],
  entries: Entry[],
  effects: Map<string, Effect[]>,
): RecordStanding {
  const ranges: RecordStanding["ranges"] = [];
  const incoming = entries.filter(
    (event) =>
      event.relation?.target === entry.ref &&
      selectors.some((selector) => overlaps(entry, selector, event.relation!.selector)),
  );
  for (const event of incoming) {
    for (const effect of effects.get(event.ref) ?? []) {
      const relation = event.relation!;
      if (relation.type === "adopts" && entry.standing === "adopted") continue;
      const endedAdoption =
        relation.type === "adopts" &&
        entries.find(
          (later) =>
            later.relation?.target === event.ref &&
            later.relation.type !== "adopts" &&
            effects.has(later.ref) &&
            isDeepStrictEqual(later.relation.applies, effect.applies),
        );
      const standing =
        relation.type === "withdraws"
          ? "withdrawn"
          : relation.type === "replaces"
            ? "replaced"
            : endedAdoption
              ? "unresolved"
              : "adopted";
      const existing = ranges.findIndex(
        (range) =>
          isDeepStrictEqual(range.selector, relation.selector) &&
          isDeepStrictEqual(range.applies, effect.applies),
      );
      const range = {
        ...(relation.selector ? { selector: relation.selector } : {}),
        applies: effect.applies,
        standing,
        via: [...effect.via, ...(endedAdoption ? [endedAdoption.ref] : [])],
      } as RecordStanding["ranges"][number];
      if (existing >= 0) ranges[existing] = range;
      else ranges.push(range);
    }
  }
  let standing: RecordStanding["standing"] = entry.standing;
  if (ranges.length) {
    const fullyCovered = selectors.every((selector) =>
      ranges.some((range) => {
        const selected = bounds(entry, selector);
        const affected = bounds(entry, range.selector);
        return (
          affected.start <= selected.start &&
          affected.end >= selected.end &&
          isDeepStrictEqual(range.applies, entry.applies)
        );
      }),
    );
    const states = new Set(ranges.map((range) => range.standing));
    standing = fullyCovered && states.size === 1 ? ranges[0].standing : "partial";
  }
  return {
    ref: entry.ref,
    ...(selectors.length === 1 && selectors[0] ? { selector: selectors[0] } : {}),
    standing,
    ranges,
  };
}

export function checkLedgerChanges(ledger: Ledger, input: CheckInput): CheckResult {
  const seeds = normalizeSeeds(input.seeds);
  const at = atPosition(ledger, input.at);
  const budget = input.budget ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(budget) || budget < 0) reject("budget must be a non-negative integer");
  const entries = ledger.entries.slice(0, at);
  const byRef = new Map(entries.map((entry) => [entry.ref, entry]));
  const selected = new Map<string, (Selector | undefined)[]>();
  const seedRefs = new Set(seeds.map(({ ref }) => ref));
  const gaps: Gap[] = [];
  const queue: string[] = [];
  function include(ref: string, selector?: Selector) {
    const existing = selected.get(ref);
    if (existing) {
      // Returning through a correction must not widen the caller's seed range.
      if (seedRefs.has(ref) || existing.includes(undefined)) return;
      if (selector === undefined) selected.set(ref, [undefined]);
      else {
        const entry = byRef.get(ref);
        if (!entry) return;
        const addition = bounds(entry, selector);
        const ranges = existing
          .map((value) => bounds(entry, value))
          .sort((left, right) => left.start - right.start);
        if (ranges.some((range) => range.start <= addition.start && range.end >= addition.end))
          return;
        ranges.push(addition);
        ranges.sort((left, right) => left.start - right.start);
        const merged: { start: number; end: number }[] = [];
        for (const range of ranges) {
          const previous = merged.at(-1);
          if (previous && previous.end >= range.start)
            previous.end = Math.max(previous.end, range.end);
          else merged.push({ ...range });
        }
        selected.set(ref, merged);
      }
      queue.push(ref);
      return;
    }
    if (selected.size >= budget) {
      if (!gaps.some((gap) => gap.type === "budget" && gap.ref === ref))
        gaps.push({
          type: "budget",
          ref,
          reason: "The correction closure exceeds this query's record budget",
        });
      return;
    }
    selected.set(ref, [selector]);
    queue.push(ref);
  }
  for (const seed of seeds) {
    const selectors = selected.get(seed.ref);
    if (selectors) selectors.push(seed.selector);
    else include(seed.ref, seed.selector);
  }
  for (let index = 0; index < queue.length; index++) {
    const ref = queue[index];
    const entry = byRef.get(ref);
    if (!entry) {
      if (parseReference(ref, true).kind === "evidence")
        gaps.push({
          type: "missing-record",
          ref,
          reason: `This evidence is unavailable at ledger position ${at}`,
        });
      continue;
    }
    const selectors = selected.get(ref)!;
    selectors.forEach((selector) => bounds(entry, selector));
    if (entry.relation) include(entry.relation.target, entry.relation.selector);
    for (const event of entries) {
      if (
        event.relation?.target !== ref ||
        !selectors.some((selector) => overlaps(entry, selector, event.relation!.selector))
      )
        continue;
      include(event.ref);
    }
  }
  const records = entries.filter(({ ref }) => selected.has(ref));
  const effects = admittedEffects(records);
  const relations: CheckedRelation[] = records
    .filter((entry) => entry.relation)
    .map((entry) => ({ ...entry.relation!, ref: entry.ref, effective: effects.has(entry.ref) }));
  const standings = records.map((entry) =>
    standingFor(entry, selected.get(entry.ref)!, records, effects),
  );
  const conflicts: CheckResult["conflicts"] = [];
  for (const entry of records) {
    const incoming = records.filter(
      (event) =>
        event.relation?.target === entry.ref &&
        event.relation.type !== "adopts" &&
        effects.has(event.ref),
    );
    for (let left = 0; left < incoming.length; left++)
      for (let right = left + 1; right < incoming.length; right++) {
        const a = incoming[left];
        const b = incoming[right];
        const independentReplacements =
          a.relation!.type === "replaces" && b.relation!.type === "replaces";
        if (
          overlaps(entry, a.relation!.selector, b.relation!.selector) &&
          (independentReplacements || !isDeepStrictEqual(a.relation!.applies, b.relation!.applies))
        )
          conflicts.push({
            target: entry.ref,
            refs: [a.ref, b.ref],
            reason: independentReplacements
              ? "Independent accepted replacements overlap; selecting a replacement needs an agent's judgment"
              : "Correction applicability differs; semantic overlap needs an agent's judgment",
          });
      }
  }
  const coverage = gaps.length ? "partial" : "complete";
  const current: Basis = {
    version: 1,
    component: "evidence",
    seeds,
    at,
    coverage,
    fingerprint: fingerprint({ seeds, records, gaps, coverage }),
  };
  const prior = input.basis === undefined ? undefined : parseBasis(input.basis);
  const change =
    !prior || coverage === "partial" || prior.coverage === "partial"
      ? "unknown"
      : !isDeepStrictEqual(prior.seeds, seeds) || prior.fingerprint !== current.fingerprint
        ? "changed"
        : "unchanged";
  return {
    at,
    coverage,
    records: originals(records, entries),
    relations,
    standings,
    conflicts,
    gaps,
    basis: JSON.stringify(current),
    change,
  };
}

export async function checkChanges(location: ProjectLocation, input: CheckInput) {
  return checkLedgerChanges(await readLedger(location), input);
}

export function checkTargetChanges(ledger: Ledger, seed: Seed, basis: string) {
  const prior = parseBasis(basis);
  const entry = ledger.entries.find(({ ref }) => ref === seed.ref);
  if (!entry) reject(`Correction target is missing: ${seed.ref}`);
  const target = bounds(entry, seed.selector);
  const covered = prior.seeds.some((observed) => {
    if (observed.ref !== seed.ref) return false;
    const range = bounds(entry, observed.selector);
    return range.start <= target.start && range.end >= target.end;
  });
  const checked = checkLedgerChanges(ledger, { seeds: prior.seeds, basis });
  return covered ? checked : { ...checked, change: "changed" as const };
}

type Page = { version: 1; at: number; offset: number; query: string };

export async function discover(
  location: ProjectLocation,
  input: DiscoverInput,
): Promise<DiscoverResult> {
  if (typeof input.query !== "string") reject("query must be a string");
  if (input.scope !== undefined) validateMemoryScope(input.scope);
  const maxGroups = input.maxGroups ?? 10;
  if (!Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > 200)
    reject("maxGroups must be between 1 and 200");
  const signature = fingerprint({
    query: input.query,
    scope: input.scope,
    work: input.work,
    maxGroups,
    grouping: "logical-id",
    representationRevision: 1,
  });
  let page: Page | undefined;
  if (input.cursor !== undefined) {
    try {
      page = JSON.parse(input.cursor) as Page;
      if (
        page.version !== 1 ||
        page.query !== signature ||
        !Number.isSafeInteger(page.offset) ||
        page.offset < 0 ||
        (input.at !== undefined && input.at !== "current" && input.at !== page.at)
      )
        reject("Cursor does not match this discovery query");
    } catch {
      reject("Invalid discovery cursor or mismatched query");
    }
  }
  const ledger = await readLedger(location);
  const at = atPosition(ledger, page?.at ?? input.at);
  const entries = ledger.entries.slice(0, at).filter((entry) => {
    if (input.scope && !isDeepStrictEqual(entry.scope, input.scope)) return false;
    return (
      input.work === undefined || entry.scope.type === "project" || entry.scope.id === input.work
    );
  });
  const records = originals(entries);
  const ranked = input.query.trim()
    ? rankSourcesByQuery(records, input.query, records.length)
    : records
        .slice()
        .reverse()
        .map((entry) => ({ ref: entry.ref, score: 0, excerpt: entry.text.slice(0, 800) }));
  const groups = new Map<string, Group>();
  const byRef = new Map(records.map((entry) => [entry.ref, entry]));
  for (const match of ranked) {
    const record = byRef.get(match.ref)!;
    let group = groups.get(record.id);
    if (!group) {
      const revisions = records.filter(({ id }) => id === record.id);
      group = {
        id: record.id,
        latest: revisions.at(-1)!.ref,
        refs: revisions.map(({ ref }) => ref),
        matches: [],
      };
      groups.set(record.id, group);
    }
    group.matches.push({
      ref: match.ref,
      score: match.score,
      excerpt: match.excerpt,
      source: "original",
    });
  }
  const ordered = [...groups.values()];
  const offset = page?.offset ?? 0;
  const nextOffset = offset + maxGroups;
  return {
    groups: ordered.slice(offset, nextOffset),
    at,
    coverage: [{ channel: "evidence-ledger", through: at, status: "complete" }],
    index: { mode: "ledger-scan", through: at, representationRevision: 1 },
    gaps: [],
    discoveryBasis: {
      query: input.query,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.work ? { work: input.work } : {}),
      at,
      channels: ["evidence-ledger"],
      representationRevision: 1,
      fingerprint: fingerprint({ signature, refs: entries.map(({ ref }) => ref) }),
    },
    ...(nextOffset < ordered.length
      ? {
          nextCursor: JSON.stringify({
            version: 1,
            at,
            offset: nextOffset,
            query: signature,
          } satisfies Page),
        }
      : {}),
  };
}
