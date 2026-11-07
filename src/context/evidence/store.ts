import type { ProjectLocation } from "../storage/store.ts";
import type {
  AppendInput,
  Applies,
  Content,
  CorrectInput,
  Entry,
  Ledger,
  Original,
  Selector,
} from "./model.ts";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  parseRecordId,
  validateArray,
  validateChoice,
  validateMemoryScope,
  validateObject,
  validateRecordSource,
  validateText,
} from "../records/records.ts";
import { readStoredRecord } from "../storage/store.ts";

export function reject(message: string): never {
  throw Object.assign(new Error(message), { code: "LOOM_EVIDENCE_REJECTED", outcome: "rejected" });
}

function boundary<T>(parse: () => T): T {
  try {
    return parse();
  } catch (caught) {
    reject((caught as Error).message);
  }
}

export function parseReference(ref: unknown, legacy = false) {
  validateText(ref, "ref");
  const parts = /^(evidence|memory|checkpoint|note|work):([^@]+)@([1-9][0-9]*)$/.exec(ref);
  if (!parts || (!legacy && parts[1] !== "evidence"))
    reject(`Invalid exact evidence reference: ${ref}`);
  const id = parseRecordId(parts[2]);
  const revision = Number(parts[3]);
  if (!Number.isSafeInteger(revision)) reject("Reference revision must be a safe integer");
  return { kind: parts[1], id, revision };
}

function parseApplies(value: unknown): Applies {
  validateObject(value, "applies");
  validateText(value.target, "applies.target");
  validateArray(value.conditions, "applies.conditions");
  value.conditions.forEach((condition) => validateText(condition, "applies.conditions[]"));
  validateText(value.lifetime, "applies.lifetime");
  if (value.targetVersion !== undefined) validateText(value.targetVersion, "applies.targetVersion");
  return {
    target: value.target,
    conditions: [...value.conditions] as string[],
    lifetime: value.lifetime,
    ...(value.targetVersion === undefined ? {} : { targetVersion: value.targetVersion as string }),
  };
}

export function parseSelector(value: unknown): Selector {
  validateObject(value, "selector");
  if (value.unit !== undefined) {
    parseRecordId(value.unit, "selector.unit");
    if (value.start !== undefined || value.end !== undefined)
      reject("A selector must name a unit or a range");
    return { unit: value.unit as string };
  }
  if (
    !Number.isSafeInteger(value.start) ||
    !Number.isSafeInteger(value.end) ||
    (value.start as number) < 0 ||
    (value.end as number) <= (value.start as number)
  )
    reject("A selector range needs non-negative start and greater end offsets");
  return { start: value.start as number, end: value.end as number };
}

export function bounds(entry: Entry, selector?: Selector) {
  if (!selector) return { start: 0, end: entry.text.length };
  if ("unit" in selector) {
    const unit = entry.units?.find(({ id }) => id === selector.unit);
    if (!unit) reject(`Unknown unit ${selector.unit} in ${entry.ref}`);
    return { start: unit.start, end: unit.end };
  }
  if (selector.end > entry.text.length)
    reject(`Selector exceeds the immutable text in ${entry.ref}`);
  return selector;
}

function parseContent(value: Record<string, unknown>): Content {
  validateMemoryScope(value.scope);
  validateText(value.text, "text");
  validateChoice(
    value.kind,
    ["decision", "correction", "proposal", "inference", "observation"],
    "kind",
  );
  validateChoice(value.standing, ["proposed", "adopted", "unresolved", "observed"], "standing");
  validateRecordSource(value.source);
  validateChoice(value.capture, ["direct", "reported", "inferred"], "capture");
  if (value.capture !== "direct" && value.source.type !== "agent")
    reject("Reported or inferred evidence needs an agent source");
  const content: Content = {
    scope: structuredClone(value.scope),
    text: value.text,
    kind: value.kind,
    standing: value.standing,
    applies: parseApplies(value.applies),
    source: { ...value.source },
    capture: value.capture,
  };
  if (value.reason !== undefined) {
    validateText(value.reason, "reason");
    content.reason = value.reason;
  }
  if (value.locator !== undefined) {
    validateObject(value.locator, "locator");
    validateText(value.locator.reference, "locator.reference");
    if (value.locator.version !== undefined) validateText(value.locator.version, "locator.version");
    if (value.locator.extent !== undefined) validateText(value.locator.extent, "locator.extent");
    content.locator = {
      reference: value.locator.reference,
      ...(value.locator.version === undefined ? {} : { version: value.locator.version as string }),
      ...(value.locator.extent === undefined ? {} : { extent: value.locator.extent as string }),
    };
  }
  if (value.access !== undefined) {
    validateObject(value.access, "access");
    validateChoice(value.access.status, ["read", "unavailable", "not-attempted"], "access.status");
    if (value.access.status === "read") {
      validateText(value.access.resolvedLocator, "access.resolvedLocator");
      validateText(value.access.capturedExtent, "access.capturedExtent");
      if (value.access.observedVersion !== undefined)
        validateText(value.access.observedVersion, "access.observedVersion");
      content.access = {
        status: "read",
        resolvedLocator: value.access.resolvedLocator,
        capturedExtent: value.access.capturedExtent,
        ...(value.access.observedVersion === undefined
          ? {}
          : { observedVersion: value.access.observedVersion as string }),
      };
    } else if (value.access.status === "unavailable") {
      validateText(value.access.reason, "access.reason");
      content.access = { status: "unavailable", reason: value.access.reason };
    } else content.access = { status: "not-attempted" };
  }
  if (value.units !== undefined) {
    validateArray(value.units, "units");
    content.units = value.units.map((unit) => {
      validateObject(unit, "units[]");
      const id = parseRecordId(unit.id, "unit.id");
      const selector = parseSelector({ start: unit.start, end: unit.end });
      if (!("start" in selector) || selector.end > content.text.length)
        reject("Unit exceeds the immutable text");
      return { id, ...selector };
    });
    if (new Set(content.units.map(({ id }) => id)).size !== content.units.length)
      reject("Units must have unique IDs");
  }
  return content;
}

export function parseInput(value: unknown, operation: "append"): AppendInput;
export function parseInput(value: unknown, operation: "correct"): CorrectInput;
export function parseInput(
  value: unknown,
  operation: "append" | "correct",
): AppendInput | CorrectInput {
  return boundary(() => {
    validateObject(value, "evidence");
    if (Object.hasOwn(value, "targetVersion"))
      reject("Use applies.targetVersion for the observed target version");
    const requestKey = parseRecordId(value.requestKey, "requestKey");
    const content = parseContent(value);
    const input = {
      requestKey,
      ...(value.id === undefined ? {} : { id: parseRecordId(value.id) }),
      ...content,
    };
    if (operation === "append") {
      if (value.relation !== undefined || value.basis !== undefined)
        reject("Use correct to record a relation and basis");
      return input;
    }
    validateObject(value.relation, "relation");
    validateChoice(value.relation.type, ["replaces", "withdraws", "adopts"], "relation.type");
    parseReference(value.relation.target);
    validateText(value.basis, "basis");
    if (value.relation.type === "adopts" && input.standing !== "adopted")
      reject("An adoption event must have adopted standing");
    return {
      ...input,
      basis: value.basis,
      relation: {
        type: value.relation.type,
        target: value.relation.target as string,
        applies: parseApplies(value.relation.applies),
        ...(value.relation.selector === undefined
          ? {}
          : { selector: parseSelector(value.relation.selector) }),
      },
    };
  });
}

export function ledgerPath(location: ProjectLocation) {
  return join(location.projectDirectory, "evidence", "ledger.json");
}

export function parseLedger(value: unknown): Ledger {
  validateObject(value, "evidence ledger");
  if (value.version !== 1) throw new Error("Unsupported evidence ledger version");
  validateArray(value.entries, "entries");
  validateArray(value.requests, "requests");
  const ledger = value as Ledger;
  const seen = new Map<string, Entry>();
  const revisions = new Map<string, number>();
  for (const [index, entry] of ledger.entries.entries()) {
    validateObject(entry, "entry");
    parseContent(entry);
    const parsed = parseReference(entry.ref);
    if (
      entry.position !== index + 1 ||
      parsed.id !== entry.id ||
      parsed.revision !== entry.revision ||
      entry.revision !== (revisions.get(entry.id) ?? 0) + 1
    )
      throw new Error("Evidence positions and revisions must be consecutive");
    parseRecordId(entry.requestKey, "requestKey");
    validateText(entry.recordedAt, "recordedAt");
    if (!Number.isFinite(Date.parse(entry.recordedAt)))
      throw new Error("Invalid evidence timestamp");
    if (!entry.access) throw new Error("Stored evidence needs an explicit access status");
    if (entry.relation) {
      const receipt = ledger.requests.find(({ ref }) => ref === entry.ref);
      if (!receipt || receipt.operation !== "correct")
        throw new Error("Correction needs an atomic receipt");
      const input = parseInput(receipt.payload, "correct");
      if (!isDeepStrictEqual(input.relation, entry.relation))
        throw new Error("Correction relation differs from its receipt");
      const target = seen.get(entry.relation.target);
      if (!target) throw new Error("Correction target must precede its event");
      bounds(target, entry.relation.selector);
    }
    seen.set(entry.ref, entry);
    revisions.set(entry.id, entry.revision);
  }
  const keys = new Set<string>();
  for (const receipt of ledger.requests) {
    validateObject(receipt, "receipt");
    parseRecordId(receipt.requestKey, "receipt.requestKey");
    validateChoice(receipt.operation, ["append", "correct"], "receipt.operation");
    const input =
      receipt.operation === "append"
        ? parseInput(receipt.payload, "append")
        : parseInput(receipt.payload, "correct");
    const entry = seen.get(receipt.ref);
    if (
      keys.has(receipt.requestKey) ||
      input.requestKey !== receipt.requestKey ||
      entry?.requestKey !== receipt.requestKey
    )
      throw new Error("Invalid evidence receipt identity");
    if ((receipt.operation === "correct") !== Boolean(entry!.relation))
      throw new Error("Evidence relation differs from its receipt operation");
    const { requestKey: _requestKey, id: _id, ...payload } = input;
    const expected = { ...payload } as Partial<CorrectInput>;
    delete expected.basis;
    expected.access ??= { status: "not-attempted" };
    const captured = {
      ...parseContent(entry!),
      ...(entry!.relation ? { relation: entry!.relation } : {}),
    };
    if (
      (input.id !== undefined && input.id !== entry!.id) ||
      !isDeepStrictEqual(captured, expected)
    )
      throw new Error("Evidence content differs from its durable receipt payload");
    keys.add(receipt.requestKey);
  }
  if (keys.size !== ledger.entries.length)
    throw new Error("Each evidence entry needs one atomic receipt");
  return ledger;
}

export async function readLedger(location: ProjectLocation): Promise<Ledger> {
  return (
    (await readStoredRecord(ledgerPath(location), parseLedger)) ?? {
      version: 1,
      entries: [],
      requests: [],
    }
  );
}

export function originals(entries: Entry[], heads = entries): Original[] {
  const latest = new Map<string, number>();
  for (const entry of heads) latest.set(entry.id, entry.revision);
  return entries.map(({ kind, ...entry }) => ({
    ...entry,
    kind: "evidence",
    recordKind: kind,
    latest: entry.revision === latest.get(entry.id),
  }));
}
