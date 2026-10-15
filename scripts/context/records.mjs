import { isDeepStrictEqual } from "node:util";

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateText(text, label) {
  assertCondition(text.trim().length > 0, `${label} must not be empty`);
}

export function parseRecordId(recordId) {
  assertCondition(recordId.match(/^[a-z0-9][a-z0-9-]{0,79}$/) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(recordId),
  "Record IDs must use 1–80 lowercase letters, digits or hyphens, and avoid reserved Windows names");
  return recordId;
}

export function parseRevisionNumber(revision) {
  assertCondition(Number.isSafeInteger(revision) && revision >= 0, "expectedRevision must be a non-negative integer");
  return revision;
}

export function validateRecordSource(source) {
  validateText(source.reference, "source.reference");
}

export function validateMemoryScope(scope) {
  if (scope.type === "work") parseRecordId(scope.id);
}

function validateMemoryContent(memory) {
  validateText(memory.text, "text");
  validateText(memory.reason, "reason");
  validateRecordSource(memory.source);
}

function validateTextArray(items, label) {
  items.forEach((text) => validateText(text, label));
}

export function validateWorkProgress(workState, validateEvidence = validateTextArray) {
  validateText(workState.goal, "goal");
  validateText(workState.progress, "progress");
  validateEvidence(workState.evidence, "evidence");
  validateTextArray(workState.next, "next");
  assertCondition(workState.status !== "complete" || (workState.evidence.length > 0 && workState.next.length === 0),
    "A complete checkpoint needs evidence and no remaining next steps");
}

function validateCheckpointContent(checkpoint) {
  validateWorkProgress(checkpoint);
  validateRecordSource(checkpoint.source);
}

export function parseMemoryInput({ expectedRevision, scope, text, reason, source }) {
  const memoryInput = { expectedRevision, scope, text, reason, source };
  parseRevisionNumber(memoryInput.expectedRevision);
  validateMemoryScope(memoryInput.scope);
  validateMemoryContent(memoryInput);
  return memoryInput;
}

export function parseCheckpointInput({ expectedRevision, goal, status, progress, evidence, next, source }) {
  const checkpointInput = { expectedRevision, goal, status, progress, evidence, next, source };
  parseRevisionNumber(checkpointInput.expectedRevision);
  validateCheckpointContent(checkpointInput);
  return checkpointInput;
}

function validateTimestamp(timestamp) {
  assertCondition(Number.isFinite(Date.parse(timestamp)), "Invalid recordedAt timestamp");
}

export function validateRecordVersion(record) {
  assertCondition(record.version === 1, "Unsupported record version; expected version 1");
}

export function validateRecordRevisions(revisions, validateContent) {
  assertCondition(revisions.length > 0, "Record needs at least one revision");
  revisions.forEach((storedRevision, index) => {
    assertCondition(storedRevision.revision === index + 1, "Record revisions must be consecutive, starting at 1");
    validateTimestamp(storedRevision.recordedAt);
    validateContent(storedRevision);
  });
}

export function parseMemoryRecord(memoryRecord) {
  validateRecordVersion(memoryRecord);
  if (memoryRecord.forgotten === true) {
    assertCondition(parseRevisionNumber(memoryRecord.revision) > 1, "Invalid forgotten memory revision");
    validateTimestamp(memoryRecord.recordedAt);
    return memoryRecord;
  }
  validateMemoryScope(memoryRecord.scope);
  validateRecordRevisions(memoryRecord.revisions, validateMemoryContent);
  return memoryRecord;
}

export function parseCheckpointRecord(checkpointRecord) {
  validateRecordVersion(checkpointRecord);
  validateRecordRevisions(checkpointRecord.revisions, validateCheckpointContent);
  return checkpointRecord;
}

export function createRecordParser(expectedId, parseRecord) {
  return (storedContent) => {
    const parsedRecord = parseRecord(storedContent);
    assertCondition(parsedRecord.id === expectedId, `Record ID does not match its file: expected ${expectedId}`);
    return parsedRecord;
  };
}

function assertRevision(actualRevision, expectedRevision) {
  assertCondition(actualRevision === expectedRevision,
    `Revision conflict: current revision is ${actualRevision}; recall and reconcile before retrying`);
}

export function appendRecordRevision(storedRecord, identity, revisionInput) {
  const { expectedRevision, ...revisionContent } = revisionInput;
  const previousRevision = storedRecord?.revisions.at(-1);
  if (previousRevision) {
    const { revision, recordedAt, ...previousContent } = previousRevision;
    if (revision === expectedRevision + 1 && isDeepStrictEqual(previousContent, revisionContent)) return storedRecord;
  }
  assertRevision(previousRevision?.revision ?? 0, expectedRevision);
  return {
    version: 1, ...identity,
    revisions: [...(storedRecord?.revisions ?? []), {
      ...revisionContent, revision: expectedRevision + 1, recordedAt: new Date().toISOString(),
    }],
  };
}

export function reviseMemoryRecord(storedMemory, memoryId, memoryInput) {
  const { scope, ...revisionInput } = memoryInput;
  assertCondition(!storedMemory?.forgotten, "This memory was forgotten; use a new ID to record a new memory");
  assertCondition(!storedMemory || isDeepStrictEqual(storedMemory.scope, scope),
    "A memory's scope cannot change; record a separate memory in the new scope");
  return appendRecordRevision(storedMemory, { id: memoryId, scope }, revisionInput);
}

export function reviseCheckpointRecord(storedCheckpoint, workId, checkpointInput) {
  return appendRecordRevision(storedCheckpoint, { id: workId }, checkpointInput);
}

export function forgetMemoryRecord(storedMemory, expectedRevision) {
  if (storedMemory.forgotten) return storedMemory;
  assertRevision(storedMemory.revisions.at(-1).revision, expectedRevision);
  return { version: 1, id: storedMemory.id, forgotten: true, revision: expectedRevision + 1,
    recordedAt: new Date().toISOString() };
}

export function presentLatestRevision(storedRecord, includeHistory = false) {
  if (storedRecord === null) return null;
  const { version, revisions, ...identity } = storedRecord;
  if (storedRecord.forgotten) return identity;
  const latestRevision = { ...identity, ...revisions.at(-1) };
  if (includeHistory) latestRevision.history = revisions.slice(0, -1);
  return latestRevision;
}
