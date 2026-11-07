import type { Ledger } from "../evidence/model.ts";
import type { ProjectLocation } from "../storage/store.ts";
import type {
  Memory,
  ConsolidationHistory,
  TidyPreparationOptions,
  Consolidation,
  TidyChanges,
  TidySnapshot,
  TidyResult,
  Receipt,
} from "./model.ts";
import type { OriginalSource, SourceArchive } from "../sources/model.ts";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createRecordParser, validateText } from "../records/records.ts";
import {
  findUnprocessedSources,
  matchesContextScope,
  readSourceArchive,
  requireSourceByReference,
  validateSourceReferences,
} from "../sources/sources.ts";
import { updateStoredRecord, readStoredRecord, withProjectLock } from "../storage/store.ts";
import { emptyGraph } from "../graph/graph.ts";
import { presentWork } from "../work/work.ts";
import { extractSearchText } from "../sources/search.ts";
import { readLedger } from "../evidence/evidence.ts";
import { basisFingerprint, checkLedgerChanges } from "../evidence/query.ts";
import { contextSelection } from "./compaction.ts";
import {
  parseConsolidationHistory,
  getLatestConsolidation,
  collectMemoryBaseline,
  parseTidySnapshot,
  parseTidyChanges,
  hashChanges,
  hashOriginalSource,
  assertTidyRevision,
  validatePreparedSources,
  buildConsolidation,
  calculateTidyStatus,
} from "./consolidation.ts";

export function consolidationHistoryPath(location: ProjectLocation) {
  return join(location.projectDirectory, "tidy.json");
}

export async function readConsolidationHistory(location: ProjectLocation) {
  return readStoredRecord(consolidationHistoryPath(location), parseConsolidationHistory);
}

function snapshotPath(location: ProjectLocation, id: string) {
  return join(location.projectDirectory, "tidy-snapshots", `${id}.json`);
}

function currentPage(
  archive: SourceArchive,
  consolidation: Consolidation,
  { limit = 50, offset = 0, work, query, full }: TidyPreparationOptions,
  matches: (entry: Memory | OriginalSource) => boolean,
) {
  const matchesWork = contextSelection({ work, query });
  const legacyWorks = consolidation.works.filter(
    (entry) =>
      !(archive.works ?? []).some(({ id }) => id === entry.id) &&
      matchesWork({ ...entry, scope: { type: "work", id: entry.id } }),
  );
  const memories = collectMemoryBaseline(archive, consolidation).filter(
    (memory) => memory.status !== "retired" && memory.status !== "absorbed" && matches(memory),
  );
  const retired = consolidation.memories
    .filter((memory) => memory.status === "retired" && matches(memory))
    .map(({ id, scope, retirement }) => ({ id, scope, ...retirement }));
  const managed = (archive.works ?? [])
    .map((record) => presentWork(record.revisions.at(-1)!))
    .filter((entry) =>
      matchesWork({ ...entry, workScope: entry.scope, scope: { type: "work", id: entry.id } }),
    );
  const end = offset + limit;
  return {
    memories: memories.slice(offset, end),
    memoriesRemaining: Math.max(0, memories.length - end),
    works: legacyWorks.slice(offset, end),
    worksRemaining: Math.max(0, legacyWorks.length - end),
    managedWorks: managed.slice(offset, end),
    managedWorksRemaining: Math.max(0, managed.length - end),
    retired: retired.slice(offset, end),
    retiredRemaining: Math.max(0, retired.length - end),
    ...(full ? { graph: consolidation.graph ?? emptyGraph() } : {}),
  };
}

function select(
  archive: SourceArchive,
  consolidation: Consolidation,
  options: TidyPreparationOptions,
) {
  const { work, query, refs, limit = 50 } = options;
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (entry: Memory | OriginalSource) =>
    !("status" in entry && entry.status === "absorbed") &&
    (work === undefined || matchesContextScope(entry, work)) &&
    words.every((word) => extractSearchText(entry).toLowerCase().includes(word)) &&
    (refs === undefined ||
      ("ref" in entry
        ? refs.includes(entry.ref)
        : entry.sources.some((ref) => refs.includes(ref))));
  const pending = (
    refs === undefined
      ? findUnprocessedSources(archive, consolidation.cursor)
      : refs.map((ref) => requireSourceByReference(archive, ref))
  ).filter((source) => !source.forgotten && matches(source));
  const records = pending.slice(0, limit);
  const current = currentPage(archive, consolidation, options, matches);
  const hashes = Object.fromEntries(
    records.map((source) => [source.ref, hashOriginalSource(source)]),
  );
  const memories = Object.fromEntries(
    current.memories.map((memory) => [memory.id, hashOriginalSource(memory)]),
  );
  const batch = [
    ...records.map(({ ref }) => ref),
    ...current.memories.map(({ id }) => `current:${id}`),
  ];
  const seeds = [
    ...new Set([
      ...records.map(({ ref }) => ref),
      ...current.memories.flatMap((memory) => [...memory.sources, ...memory.supersedes]),
    ]),
  ].sort();
  return {
    pending,
    records,
    current,
    hashes,
    memories,
    batch,
    seeds,
    remaining: pending.length - records.length,
  };
}

function fingerprint(purpose: string, selected: ReturnType<typeof select>, basis: string) {
  return hashOriginalSource({
    purpose,
    hashes: selected.hashes,
    memories: selected.memories,
    basis: basisFingerprint(basis),
  });
}

function at(archive: SourceArchive) {
  return archive.sources.reduce(
    (position, source) =>
      source.kind === "evidence" && "position" in source
        ? Math.max(position, source.position)
        : position,
    0,
  );
}

export async function status(
  location: ProjectLocation,
  options: Partial<TidyPreparationOptions> = {},
) {
  const [archive, history, ledger] = await Promise.all([
    readSourceArchive(location),
    readConsolidationHistory(location),
    readLedger(location),
  ]);
  return reviewStatus(archive, history, ledger, options);
}

export function reviewStatus(
  archive: SourceArchive,
  history: ConsolidationHistory | null,
  ledger: Ledger,
  options: Partial<TidyPreparationOptions> = {},
) {
  const purpose = options.purpose ?? "resume";
  validateText(purpose, "purpose");
  const current = getLatestConsolidation(history);
  const selected = select(archive, current, { limit: 50, ...options });
  const dependencies = checkLedgerChanges(ledger, { seeds: selected.seeds, at: at(archive) });
  const input = fingerprint(purpose, selected, dependencies.basis);
  const receipt = history?.receipts?.findLast(
    (receipt) =>
      !receipt.forgotten &&
      receipt.purpose === purpose &&
      (receipt.input === input || receipt.output === input),
  );
  const measured = calculateTidyStatus(archive, current, Date.now(), { ...options, history });
  return {
    ...measured,
    due: receipt ? false : measured.due,
    reasons: receipt ? [] : measured.reasons,
    purpose,
    reviewed: receipt !== undefined,
    needed: selected.batch.length > 0 && !receipt,
    remaining: selected.remaining + selected.current.memoriesRemaining,
    previousReview: receipt
      ? { key: receipt.key, snapshot: receipt.snapshot, recordedAt: receipt.recordedAt }
      : null,
    dependencies,
  };
}

export async function prepareTidyBatch(location: ProjectLocation, options: TidyPreparationOptions) {
  const purpose = options.purpose ?? "resume";
  validateText(purpose, "purpose");
  if (options.refs !== undefined) validateSourceReferences(options.refs, "refs");
  const [archive, history, ledger] = await Promise.all([
    readSourceArchive(location),
    readConsolidationHistory(location),
    readLedger(location),
  ]);
  const consolidation = getLatestConsolidation(history);
  const selected = select(archive, consolidation, options);
  const checked = checkLedgerChanges(ledger, { seeds: selected.seeds, at: at(archive) });
  const input = fingerprint(purpose, selected, checked.basis);
  const receipt = history?.receipts?.find(
    (receipt) =>
      !receipt.forgotten &&
      receipt.purpose === purpose &&
      (receipt.input === input || receipt.output === input),
  );
  if (!selected.batch.length || receipt)
    return {
      snapshot: null,
      records: [],
      remaining: selected.remaining + selected.current.memoriesRemaining,
      current: selected.current,
      batch: selected.batch,
      purpose,
      basis: checked.basis,
      dependencies: checked,
      reviewed: receipt !== undefined,
      ...(receipt ? { result: receipt.result } : {}),
    };
  const snapshot: TidySnapshot = {
    version: 3,
    id: randomUUID(),
    baseRevision: consolidation.revision,
    bounds: archive.bounds,
    hashes: selected.hashes,
    memoryIds: selected.current.memories.map(({ id }) => id),
    memories: selected.memories,
    purpose,
    input,
    batch: selected.batch,
    selection: options,
    seeds: selected.seeds,
    basis: checked.basis,
  };
  await updateStoredRecord({
    path: snapshotPath(location, snapshot.id),
    parse: parseTidySnapshot,
    update: () => snapshot,
  });
  return {
    snapshot: snapshot.id,
    baseRevision: consolidation.revision,
    records: selected.records,
    remaining: selected.remaining + selected.current.memoriesRemaining,
    current: selected.current,
    batch: selected.batch,
    purpose,
    basis: checked.basis,
    dependencies: checked,
    reviewed: false,
  };
}

function appliedChanges(current: Consolidation, changes: TidyChanges) {
  const memoryIds = new Set([
    ...[...changes.memories, ...changes.retire].map(({ id }) => id),
    ...(changes.absorb ?? []).flatMap(({ from }) => from),
  ]);
  const workIds = new Set(changes.works.map(({ id }) => id));
  return {
    ...current,
    memories: current.memories.filter(({ id }) => memoryIds.has(id)),
    works: current.works.filter(({ id }) => workIds.has(id)),
  };
}

function reject(message: string, outcome: "conflict" | "rejected" = "rejected"): never {
  throw Object.assign(new Error(message), { outcome });
}

function validateReview(snapshot: TidySnapshot, changes: TidyChanges) {
  const batch = snapshot.batch ?? Object.keys(snapshot.hashes ?? {});
  const reviewed = changes.reviewed ?? batch;
  const read = changes.read ?? [...new Set([...batch, ...(snapshot.seeds ?? [])])];
  if (!isDeepStrictEqual([...reviewed].sort(), [...batch].sort()))
    reject("Reviewed targets must match the whole prepared batch");
  if (!reviewed.every((ref) => read.includes(ref)))
    reject("Every reviewed target must have been read");
  return { reviewed, read };
}

export async function result(
  location: ProjectLocation,
  input: { key?: string; snapshot?: string },
) {
  const history = await readConsolidationHistory(location);
  const receipt = history?.receipts?.find(
    (receipt) =>
      (input.key !== undefined && receipt.key === input.key) ||
      (input.snapshot !== undefined && receipt.snapshot === input.snapshot),
  );
  if (receipt?.forgotten)
    reject("This tidy result used a forgotten source; do not retry its old input");
  return receipt?.result ?? null;
}

export async function applyTidyChanges(
  location: ProjectLocation,
  input: unknown,
): Promise<TidyResult> {
  let changes: TidyChanges;
  try {
    changes = parseTidyChanges(input);
  } catch (error) {
    throw Object.assign(error as Error, { outcome: "rejected" });
  }
  const requestHash = hashChanges(changes);
  const key = changes.key ?? changes.snapshot;
  let applied: TidyResult | undefined;
  await withProjectLock(location, async () => {
    await updateStoredRecord({
      path: consolidationHistoryPath(location),
      parse: parseConsolidationHistory,
      async update(previous) {
        const prior = previous?.receipts?.find(
          (receipt) => receipt.key === key || receipt.snapshot === changes.snapshot,
        );
        if (prior) {
          if (prior.forgotten)
            reject("This tidy result used a forgotten source; do not retry its old input");
          if (
            prior.key !== key ||
            prior.snapshot !== changes.snapshot ||
            prior.hash !== requestHash
          )
            reject("The tidy request key or snapshot was already used with different content");
          applied = prior.result;
          return previous!;
        }
        const snapshot = await readStoredRecord(
          snapshotPath(location, changes.snapshot),
          createRecordParser(changes.snapshot, parseTidySnapshot),
        );
        if (!snapshot) reject("Tidy snapshot is missing or invalid");
        const current = getLatestConsolidation(previous);
        const old = previous?.revisions.find((revision) => revision.snapshot === snapshot.id);
        if (old) {
          if (old.requestHash !== requestHash)
            reject("The tidy snapshot was already used with different content");
          applied = {
            ...appliedChanges(old, changes),
            outcome: "applied",
            effect: "changed",
            key,
            reviewed: old.report?.processed ?? [],
            remaining: old.report?.remaining ?? 0,
          };
          return previous!;
        }
        try {
          assertTidyRevision(current, snapshot);
        } catch (error) {
          throw Object.assign(error as Error, { outcome: "conflict" });
        }
        const [archive, ledger] = await Promise.all([
          readSourceArchive(location),
          readLedger(location),
        ]);
        const checked =
          snapshot.version === 3
            ? checkLedgerChanges(ledger, { seeds: snapshot.seeds!, basis: snapshot.basis })
            : null;
        if (checked && (checked.change !== "unchanged" || checked.coverage !== "complete"))
          reject("Snapshot evidence dependencies changed; prepare a new snapshot", "conflict");
        const { reviewed, read } = validateReview(snapshot, changes);
        const recordedAt = new Date().toISOString();
        let built;
        try {
          const prepared = validatePreparedSources(archive, snapshot, changes);
          if (snapshot.version === 3) {
            const memories = new Map(
              collectMemoryBaseline(archive, current, snapshot.bounds).map((memory) => [
                memory.id,
                hashOriginalSource(memory),
              ]),
            );
            for (const [id, hash] of Object.entries(snapshot.memories!))
              if (memories.get(id) !== hash) reject(`Snapshot memory changed: ${id}`, "conflict");
          }
          built = buildConsolidation(
            { history: previous, archive, snapshot, prepared, recordedAt },
            changes,
          );
        } catch (caught) {
          const error = caught as Error & { outcome?: string };
          error.outcome ??= /changed|forgotten|missing|newer than the snapshot/.test(error.message)
            ? "conflict"
            : "rejected";
          throw error;
        }
        const candidate = getLatestConsolidation(built);
        const changed = !isDeepStrictEqual(
          {
            memories: current.memories,
            works: current.works,
            graph: current.graph ?? emptyGraph(),
          },
          {
            memories: candidate.memories,
            works: candidate.works,
            graph: candidate.graph ?? emptyGraph(),
          },
        );
        const remaining = candidate.report!.remaining;
        applied = {
          ...appliedChanges(
            changed
              ? candidate
              : { ...current, cursor: candidate.cursor, report: candidate.report },
            changes,
          ),
          outcome: "applied",
          effect: changed ? "changed" : "no-change",
          key,
          reviewed,
          remaining,
          snapshot: snapshot.id,
          requestHash,
          reviewedAt: recordedAt,
        };
        const purpose = snapshot.purpose ?? "context consolidation";
        const output =
          snapshot.version === 3
            ? select(
                archive,
                { ...candidate, revision: changed ? candidate.revision : current.revision },
                snapshot.selection!,
              )
            : null;
        const outputBasis = output
          ? checkLedgerChanges(ledger, { seeds: output.seeds }).basis
          : "legacy";
        const receipt: Receipt = {
          snapshot: snapshot.id,
          key,
          hash: requestHash,
          purpose,
          input: snapshot.input ?? hashOriginalSource({ hashes: snapshot.hashes }),
          output:
            output && output.records.length === 0
              ? fingerprint(purpose, output, outputBasis)
              : hashOriginalSource({ pending: snapshot.id }),
          reviewed,
          read,
          recordedAt,
          ...(changes.reason ? { reason: changes.reason } : {}),
          ...(changes.gaps ? { gaps: changes.gaps } : {}),
          result: applied,
        };
        if (output)
          applied.remaining =
            (snapshot.selection!.refs ? output.remaining : output.pending.length) +
            output.current.memoriesRemaining;
        return {
          ...built,
          version: 4,
          cursor: candidate.cursor,
          revisions: changed
            ? built.revisions
            : (previous?.revisions ?? []).map((revision, index, revisions) =>
                index === revisions.length - 1
                  ? { ...revision, cursor: candidate.cursor, report: candidate.report }
                  : revision,
              ),
          receipts: [...(previous?.receipts ?? []), receipt],
        };
      },
    });
  });
  return applied!;
}
