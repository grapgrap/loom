import { isDeepStrictEqual } from "node:util";

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function validateObject(value, keys, name) {
  require(value !== null && typeof value === "object" && !Array.isArray(value),
    `${name} must be a JSON object`);
  require(Object.keys(value).every((key) => keys.includes(key)), `${name} has unknown fields`);
}

function validateText(value, name) {
  require(typeof value === "string" && value.trim().length > 0, `${name} must be a non-empty string`);
}

export function recordId(value) {
  require(typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value),
  "Record IDs must use 1–80 lowercase letters, digits or hyphens, and avoid reserved Windows names");
  return value;
}

export function revisionNumber(value) {
  require(Number.isSafeInteger(value) && value >= 0, "expectedRevision must be a non-negative integer");
  return value;
}

function validateSource(value) {
  validateObject(value, ["type", "reference"], "source");
  require(["user", "agent"].includes(value.type), "source.type must be user or agent");
  validateText(value.reference, "source.reference");
}

function validateScope(value) {
  validateObject(value, ["type", "id"], "scope");
  require(["project", "work"].includes(value.type), "scope.type must be project or work");
  if (value.type === "work") recordId(value.id);
  else require(value.id === undefined, "Project scope cannot have a work ID");
}

function validateMemoryContent(value) {
  validateText(value.text, "text");
  validateText(value.reason, "reason");
  validateSource(value.source);
}

function validateCheckpointContent(value) {
  validateText(value.goal, "goal");
  validateText(value.progress, "progress");
  require(["active", "complete"].includes(value.status), "status must be active or complete");
  for (const name of ["evidence", "next"]) {
    require(Array.isArray(value[name]), `${name} must be an array`);
    value[name].forEach((item) => validateText(item, name));
  }
  require(value.status !== "complete" || (value.evidence.length > 0 && value.next.length === 0),
    "A complete checkpoint needs evidence and no remaining next steps");
  validateSource(value.source);
}

const memoryFields = ["text", "reason", "source"];
const checkpointFields = ["goal", "status", "progress", "evidence", "next", "source"];

export function parseMemoryInput(value) {
  validateObject(value, ["expectedRevision", "scope", ...memoryFields], "Memory input");
  revisionNumber(value.expectedRevision);
  validateScope(value.scope);
  validateMemoryContent(value);
  return value;
}

export function parseCheckpointInput(value) {
  validateObject(value, ["expectedRevision", ...checkpointFields], "Checkpoint input");
  revisionNumber(value.expectedRevision);
  validateCheckpointContent(value);
  return value;
}

function validateTimestamp(value) {
  require(typeof value === "string" && Number.isFinite(Date.parse(value)), "Invalid recordedAt timestamp");
}

function validateEnvelope(value) {
  require(value?.version === 1, "Unsupported record version; expected version 1");
  recordId(value.id);
}

function validateRevisions(value, fields, validateContent) {
  require(Array.isArray(value) && value.length > 0, "Record needs at least one revision");
  value.forEach((entry, index) => {
    validateObject(entry, [...fields, "revision", "recordedAt"], "Revision");
    require(entry.revision === index + 1, "Record revisions must be consecutive, starting at 1");
    validateTimestamp(entry.recordedAt);
    validateContent(entry);
  });
}

export function parseMemoryRecord(value) {
  validateEnvelope(value);
  if (value.forgotten === true) {
    validateObject(value, ["version", "id", "forgotten", "revision", "recordedAt"], "Forgotten memory");
    require(revisionNumber(value.revision) > 1, "Invalid forgotten memory revision");
    validateTimestamp(value.recordedAt);
    return value;
  }
  validateObject(value, ["version", "id", "scope", "revisions"], "Memory record");
  validateScope(value.scope);
  validateRevisions(value.revisions, memoryFields, validateMemoryContent);
  return value;
}

export function parseCheckpointRecord(value) {
  validateEnvelope(value);
  validateObject(value, ["version", "id", "revisions"], "Checkpoint record");
  validateRevisions(value.revisions, checkpointFields, validateCheckpointContent);
  return value;
}

function assertRevision(actual, expected) {
  require(actual === expected,
    `Revision conflict: current revision is ${actual}; recall and reconcile before retrying`);
}

function appendRevision(existing, identity, submission) {
  require(existing?.forgotten !== true, "This memory was forgotten; use a new ID to record a new memory");
  const { expectedRevision, ...content } = submission;
  const previous = existing?.revisions.at(-1);
  if (previous) {
    const { revision, recordedAt, ...previousContent } = previous;
    if (revision === expectedRevision + 1 && isDeepStrictEqual(previousContent, content)) return existing;
  }
  assertRevision(previous?.revision ?? 0, expectedRevision);
  return {
    version: 1, ...identity,
    revisions: [...(existing?.revisions ?? []), {
      ...content, revision: expectedRevision + 1, recordedAt: new Date().toISOString(),
    }],
  };
}

export function remember(existing, id, input) {
  const { scope, ...submission } = input;
  require(!existing || existing.forgotten || isDeepStrictEqual(existing.scope, scope),
    "A memory's scope cannot change; record a separate memory in the new scope");
  return appendRevision(existing, { id, scope }, submission);
}

export function checkpoint(existing, id, input) {
  return appendRevision(existing, { id }, input);
}

export function forget(existing, expectedRevision) {
  require(existing !== null, "Memory does not exist");
  if (existing.forgotten) return existing;
  assertRevision(existing.revisions.at(-1).revision, expectedRevision);
  return { version: 1, id: existing.id, forgotten: true, revision: expectedRevision + 1,
    recordedAt: new Date().toISOString() };
}

export function present(record, includeHistory = false) {
  if (record === null) return null;
  const { version, revisions, ...identity } = record;
  if (record.forgotten) return identity;
  const result = { ...identity, ...revisions.at(-1) };
  if (includeHistory) result.history = revisions.slice(0, -1);
  return result;
}
