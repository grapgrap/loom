import type { Scope, RecordSource, RecordHistory } from "../model.ts";
import type { WorkProgress } from "../work/model.ts";
import type {
  MemoryContent,
  MemoryRecord,
  CheckpointContent,
  CheckpointRecord,
  StoredMemory,
  ForgottenMemory,
} from "./model.ts";
import { isDeepStrictEqual } from "node:util";

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function validateText(text: unknown, label: string): asserts text is string {
  assertCondition(typeof text === "string", `${label} must be a string`);
  assertCondition(text.trim().length > 0, `${label} must not be empty`);
}

export function validateObject(
  object: unknown,
  label: string,
): asserts object is Record<string, unknown> {
  assertCondition(
    object !== null && typeof object === "object" && !Array.isArray(object),
    `${label} must be an object`,
  );
}

export function validateArray(items: unknown, label: string): asserts items is unknown[] {
  assertCondition(Array.isArray(items), `${label} must be an array`);
}

export function validateChoice<const T>(
  value: unknown,
  choices: readonly T[],
  label: string,
): asserts value is T {
  assertCondition(choices.includes(value as T), `${label} must be one of: ${choices.join(", ")}`);
}

export function parseRecordId(id: unknown, label: string = "id"): string {
  assertCondition(
    typeof id === "string" &&
      /^[a-z0-9][a-z0-9-]{0,79}$/.test(id) &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id),
    `${label} must use 1–80 lowercase letters, digits or hyphens, and avoid reserved Windows names`,
  );
  return id;
}

export function parseRevisionNumber(revision: unknown, label = "revision"): number {
  assertCondition(
    typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0,
    `${label} must be a non-negative integer`,
  );
  return revision;
}

export function validateRecordSource(source: unknown): asserts source is RecordSource {
  validateObject(source, "source");
  validateChoice(source.type, ["user", "agent"], "source.type");
  validateText(source.reference, "source.reference");
}

export function validateMemoryScope(scope: unknown): asserts scope is Scope {
  validateObject(scope, "scope");
  validateChoice(scope.type, ["project", "work"], "scope.type");
  if (scope.type === "work") parseRecordId(scope.id, "scope.id");
}

function validateMemoryContent(memory: MemoryContent) {
  validateText(memory.text, "text");
  validateText(memory.reason, "reason");
  validateRecordSource(memory.source);
}

function validateTextArray(items: unknown, label: string): asserts items is string[] {
  validateArray(items, label);
  items.forEach((text, index) => validateText(text, `${label}[${index}]`));
}

export function validateWorkProgress(
  workState: unknown,
  validateEvidence: (items: unknown, label: string) => void = validateTextArray,
): asserts workState is WorkProgress {
  validateObject(workState, "work");
  validateChoice(
    workState.status,
    ["active", "blocked", "paused", "complete", "cancelled"],
    "status",
  );
  validateText(workState.goal, "goal");
  validateText(workState.progress, "progress");
  validateEvidence(workState.evidence, "evidence");
  validateTextArray(workState.next, "next");
  assertCondition(
    workState.status !== "complete" ||
      ((workState.evidence as string[]).length > 0 && workState.next.length === 0),
    "A complete checkpoint needs evidence and no remaining next steps",
  );
  assertCondition(
    !["blocked", "paused"].includes(workState.status) || workState.next.length > 0,
    "Blocked or paused work needs next steps and its resumption condition in progress",
  );
  assertCondition(
    workState.status !== "cancelled" || workState.next.length === 0,
    "Cancelled work cannot retain remaining next steps",
  );
}

function validateCheckpointContent(checkpoint: CheckpointContent) {
  validateWorkProgress(checkpoint);
  validateRecordSource(checkpoint.source);
}

export function parseMemoryInput(value: unknown) {
  const input = value as MemoryContent & { expectedRevision: number; scope: Scope };
  validateObject(input, "memory");
  const { expectedRevision, scope, text, reason, source } = input;
  const memory = { expectedRevision, scope, text, reason, source };
  parseRevisionNumber(expectedRevision, "expectedRevision");
  validateMemoryScope(scope);
  validateMemoryContent(memory);
  return memory;
}

export function parseCheckpointInput(value: unknown) {
  const input = value as CheckpointContent & { expectedRevision: number };
  validateObject(input, "checkpoint");
  const { expectedRevision, goal, status, progress, evidence, next, source } = input;
  const checkpoint = { expectedRevision, goal, status, progress, evidence, next, source };
  parseRevisionNumber(expectedRevision, "expectedRevision");
  validateCheckpointContent(checkpoint);
  return checkpoint;
}

function validateTimestamp(timestamp: string) {
  assertCondition(Number.isFinite(Date.parse(timestamp)), "Invalid recordedAt timestamp");
}

export function validateRecordVersion(record: unknown): asserts record is { version: number } {
  validateObject(record, "record");
  assertCondition(record.version === 1, "Unsupported record version; expected version 1");
}

export function validateRecordRevisions<T extends { revision: number; recordedAt?: string }>(
  revisions: T[],
  validateContent: (entry: T) => void,
) {
  validateArray(revisions, "revisions");
  assertCondition(revisions.length > 0, "Record needs at least one revision");
  revisions.forEach((entry, index) => {
    validateObject(entry, `revisions[${index}]`);
    assertCondition(
      entry.revision === index + 1,
      "Record revisions must be consecutive, starting at 1",
    );
    validateTimestamp(entry.recordedAt!);
    validateContent(entry);
  });
}

export function parseMemoryRecord(value: unknown): StoredMemory {
  const memory = value as StoredMemory;
  validateRecordVersion(memory);
  if (memory.forgotten === true) {
    assertCondition(parseRevisionNumber(memory.revision) > 1, "Invalid forgotten memory revision");
    validateTimestamp(memory.recordedAt);
    return memory;
  }
  validateMemoryScope(memory.scope);
  validateRecordRevisions(memory.revisions, validateMemoryContent);
  return memory;
}

export function parseCheckpointRecord(value: unknown): CheckpointRecord {
  const checkpoint = value as CheckpointRecord;
  validateRecordVersion(checkpoint);
  validateRecordRevisions(checkpoint.revisions, validateCheckpointContent);
  return checkpoint;
}

export function createRecordParser<T extends { id: string }>(
  expectedId: string,
  parseRecord: (value: unknown) => T,
) {
  return (storedContent: unknown) => {
    const parsedRecord = parseRecord(storedContent);
    assertCondition(
      parsedRecord.id === expectedId,
      `Record ID does not match its file: expected ${expectedId}`,
    );
    return parsedRecord;
  };
}

function assertRevision(actualRevision: number, expectedRevision: number) {
  assertCondition(
    actualRevision === expectedRevision,
    `Revision conflict: current revision is ${actualRevision}; recall and reconcile before retrying`,
  );
}

export function appendRecordRevision<T, I extends { id: string }>(
  record: (RecordHistory<T> & I) | null,
  identity: I,
  revisionInput: T & { expectedRevision: number },
): RecordHistory<T> & I {
  const { expectedRevision, ...revisionContent } = revisionInput;
  const previousRevision = record?.revisions.at(-1);
  if (previousRevision) {
    const { revision, recordedAt, ...previousContent } = previousRevision;
    if (revision === expectedRevision + 1 && isDeepStrictEqual(previousContent, revisionContent))
      return record!;
  }
  assertRevision(previousRevision?.revision ?? 0, expectedRevision);
  return {
    version: 1,
    ...identity,
    revisions: [
      ...(record?.revisions ?? []),
      {
        ...(revisionContent as T),
        revision: expectedRevision + 1,
        recordedAt: new Date().toISOString(),
      },
    ],
  };
}

export function reviseMemoryRecord(
  memory: StoredMemory | null,
  memoryId: string,
  input: ReturnType<typeof parseMemoryInput>,
) {
  const { scope, ...revisionInput } = input;
  assertCondition(
    !memory?.forgotten,
    "This memory was forgotten; use a new ID to record a new memory",
  );
  assertCondition(
    !memory || isDeepStrictEqual(memory.scope, scope),
    "A memory's scope cannot change; record a separate memory in the new scope",
  );
  return appendRecordRevision(memory, { id: memoryId, scope }, revisionInput);
}

export function reviseCheckpointRecord(
  checkpoint: CheckpointRecord | null,
  workId: string,
  input: ReturnType<typeof parseCheckpointInput>,
) {
  return appendRecordRevision(checkpoint, { id: workId }, input);
}

export function forgetMemoryRecord(
  memory: StoredMemory,
  expectedRevision: number,
): ForgottenMemory {
  if (memory.forgotten) return memory;
  assertRevision(memory.revisions.at(-1)!.revision, expectedRevision);
  return {
    version: 1,
    id: memory.id,
    forgotten: true,
    revision: expectedRevision + 1,
    recordedAt: new Date().toISOString(),
  };
}

type PresentedRecord<T extends RecordHistory<unknown>> = Omit<T, "version" | "revisions"> &
  T["revisions"][number] & { history?: T["revisions"] };

export function presentLatestRevision<T extends RecordHistory<unknown>>(
  record: T | null,
  includeHistory?: boolean,
): PresentedRecord<T> | null;
export function presentLatestRevision(
  record: StoredMemory | null,
  includeHistory?: boolean,
): PresentedRecord<MemoryRecord> | Omit<ForgottenMemory, "version"> | null;
export function presentLatestRevision(
  record: RecordHistory<unknown> | ForgottenMemory | null,
  includeHistory = false,
) {
  if (record === null) return null;
  const { version, revisions, ...identity } = record as RecordHistory<unknown> & {
    forgotten?: boolean;
  };
  if ("forgotten" in record && record.forgotten) return identity;
  const latestRevision: { id: string; history?: unknown[] } = { ...identity, ...revisions.at(-1) };
  if (includeHistory) latestRevision.history = revisions.slice(0, -1);
  return latestRevision;
}
