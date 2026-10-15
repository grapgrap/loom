import { isDeepStrictEqual } from "node:util";

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateText(text, label) {
  assertCondition(typeof text === "string", `${label} must be a string`);
  assertCondition(text.trim().length > 0, `${label} must not be empty`);
}

export function validateObject(object, label) {
  assertCondition(
    object !== null && typeof object === "object" && !Array.isArray(object),
    `${label} must be an object`,
  );
}

export function validateArray(items, label) {
  assertCondition(Array.isArray(items), `${label} must be an array`);
}

export function validateChoice(value, choices, label) {
  assertCondition(choices.includes(value), `${label} must be one of: ${choices.join(", ")}`);
}

export function parseRecordId(id, label = "id") {
  assertCondition(
    typeof id === "string" &&
      /^[a-z0-9][a-z0-9-]{0,79}$/.test(id) &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id),
    `${label} must use 1–80 lowercase letters, digits or hyphens, and avoid reserved Windows names`,
  );
  return id;
}

export function parseRevisionNumber(revision, label = "revision") {
  assertCondition(
    Number.isSafeInteger(revision) && revision >= 0,
    `${label} must be a non-negative integer`,
  );
  return revision;
}

export function validateRecordSource(source) {
  validateObject(source, "source");
  validateChoice(source.type, ["user", "agent"], "source.type");
  validateText(source.reference, "source.reference");
}

export function validateMemoryScope(scope) {
  validateObject(scope, "scope");
  validateChoice(scope.type, ["project", "work"], "scope.type");
  if (scope.type === "work") parseRecordId(scope.id, "scope.id");
}

function validateMemoryContent(memory) {
  validateText(memory.text, "text");
  validateText(memory.reason, "reason");
  validateRecordSource(memory.source);
}

function validateTextArray(items, label) {
  validateArray(items, label);
  items.forEach((text, index) => validateText(text, `${label}[${index}]`));
}

export function validateWorkProgress(workState, validateEvidence = validateTextArray) {
  validateObject(workState, "work");
  validateChoice(workState.status, ["active", "complete"], "status");
  validateText(workState.goal, "goal");
  validateText(workState.progress, "progress");
  validateEvidence(workState.evidence, "evidence");
  validateTextArray(workState.next, "next");
  assertCondition(
    workState.status !== "complete" ||
      (workState.evidence.length > 0 && workState.next.length === 0),
    "A complete checkpoint needs evidence and no remaining next steps",
  );
}

function validateCheckpointContent(checkpoint) {
  validateWorkProgress(checkpoint);
  validateRecordSource(checkpoint.source);
}

export function parseMemoryInput(input) {
  validateObject(input, "memory");
  const { expectedRevision, scope, text, reason, source } = input;
  const memory = { expectedRevision, scope, text, reason, source };
  parseRevisionNumber(expectedRevision, "expectedRevision");
  validateMemoryScope(scope);
  validateMemoryContent(memory);
  return memory;
}

export function parseCheckpointInput(input) {
  validateObject(input, "checkpoint");
  const { expectedRevision, goal, status, progress, evidence, next, source } = input;
  const checkpoint = { expectedRevision, goal, status, progress, evidence, next, source };
  parseRevisionNumber(expectedRevision, "expectedRevision");
  validateCheckpointContent(checkpoint);
  return checkpoint;
}

function validateTimestamp(timestamp) {
  assertCondition(Number.isFinite(Date.parse(timestamp)), "Invalid recordedAt timestamp");
}

export function validateRecordVersion(record) {
  validateObject(record, "record");
  assertCondition(record.version === 1, "Unsupported record version; expected version 1");
}

export function validateRecordRevisions(revisions, validateContent) {
  validateArray(revisions, "revisions");
  assertCondition(revisions.length > 0, "Record needs at least one revision");
  revisions.forEach((entry, index) => {
    validateObject(entry, `revisions[${index}]`);
    assertCondition(
      entry.revision === index + 1,
      "Record revisions must be consecutive, starting at 1",
    );
    validateTimestamp(entry.recordedAt);
    validateContent(entry);
  });
}

export function parseMemoryRecord(memory) {
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

export function parseCheckpointRecord(checkpoint) {
  validateRecordVersion(checkpoint);
  validateRecordRevisions(checkpoint.revisions, validateCheckpointContent);
  return checkpoint;
}

export function createRecordParser(expectedId, parseRecord) {
  return (storedContent) => {
    const parsedRecord = parseRecord(storedContent);
    assertCondition(
      parsedRecord.id === expectedId,
      `Record ID does not match its file: expected ${expectedId}`,
    );
    return parsedRecord;
  };
}

function assertRevision(actualRevision, expectedRevision) {
  assertCondition(
    actualRevision === expectedRevision,
    `Revision conflict: current revision is ${actualRevision}; recall and reconcile before retrying`,
  );
}

export function appendRecordRevision(record, identity, revisionInput) {
  const { expectedRevision, ...revisionContent } = revisionInput;
  const previousRevision = record?.revisions.at(-1);
  if (previousRevision) {
    const { revision, recordedAt, ...previousContent } = previousRevision;
    if (revision === expectedRevision + 1 && isDeepStrictEqual(previousContent, revisionContent))
      return record;
  }
  assertRevision(previousRevision?.revision ?? 0, expectedRevision);
  return {
    version: 1,
    ...identity,
    revisions: [
      ...(record?.revisions ?? []),
      {
        ...revisionContent,
        revision: expectedRevision + 1,
        recordedAt: new Date().toISOString(),
      },
    ],
  };
}

export function reviseMemoryRecord(memory, memoryId, input) {
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

export function reviseCheckpointRecord(checkpoint, workId, input) {
  return appendRecordRevision(checkpoint, { id: workId }, input);
}

export function forgetMemoryRecord(memory, expectedRevision) {
  if (memory.forgotten) return memory;
  assertRevision(memory.revisions.at(-1).revision, expectedRevision);
  return {
    version: 1,
    id: memory.id,
    forgotten: true,
    revision: expectedRevision + 1,
    recordedAt: new Date().toISOString(),
  };
}

export function presentLatestRevision(record, includeHistory = false) {
  if (record === null) return null;
  const { version, revisions, ...identity } = record;
  if (record.forgotten) return identity;
  const latestRevision = { ...identity, ...revisions.at(-1) };
  if (includeHistory) latestRevision.history = revisions.slice(0, -1);
  return latestRevision;
}
