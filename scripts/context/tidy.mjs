import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  parseRecordId, createRecordParser, parseRevisionNumber, validateWorkProgress, validateRecordRevisions,
  validateMemoryScope, validateText,
} from "./records.mjs";
import {
  advanceRevisionCursor, getCursorRevision, createRevisionCursor, parseSourceReference, findUnprocessedSources,
  readSourceArchive, requireSourceByReference,
} from "./sources.mjs";
import { updateStoredRecord, readStoredRecord } from "./store.mjs";

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function validateSourceReferences(sourceReferences, label) {
  sourceReferences.forEach(parseSourceReference);
  assertCondition(new Set(sourceReferences).size === sourceReferences.length, `${label} contains duplicate references`);
}

function validateRequiredSourceReferences(sourceReferences, label) {
  validateSourceReferences(sourceReferences, label);
  assertCondition(sourceReferences.length > 0, `${label} must contain at least one reference`);
}

function validateRevisionCursor(revisionCursor) {
  for (const kind of ["memory", "checkpoint", "note"]) {
    for (const [id, revision] of Object.entries(revisionCursor[kind])) {
      parseRecordId(id);
      parseRevisionNumber(revision);
    }
  }
}

function validateConsolidatedMemoryFields(memory) {
  parseRecordId(memory.id);
  validateMemoryScope(memory.scope);
  validateText(memory.text, "text");
  validateText(memory.reason, "reason");
  validateRequiredSourceReferences(memory.sources, "sources");
  if (memory.supersedes !== undefined) validateSourceReferences(memory.supersedes, "supersedes");
}

function validateConsolidatedMemory(memory) {
  validateConsolidatedMemoryFields(memory);
  if (memory.retirement !== undefined) {
    validateRetirementEvidence(memory.retirement);
  }
}

function validateConsolidatedWorkState(workState) {
  parseRecordId(workState.id);
  validateWorkProgress(workState, validateSourceReferences);
  validateRequiredSourceReferences(workState.sources, "sources");
}

function validateRetirementEvidence(retirement) {
  validateText(retirement.reason, "reason");
  validateRequiredSourceReferences(retirement.sources, "sources");
}

function validateMemoryRetirement(retirement) {
  parseRecordId(retirement.id);
  validateRetirementEvidence(retirement);
}

function parseTidySnapshot(snapshot) {
  assertCondition(snapshot.version === 1, "Unsupported tidy snapshot version");
  parseRecordId(snapshot.id);
  parseRevisionNumber(snapshot.baseRevision);
  validateRevisionCursor(snapshot.bounds);
  return snapshot;
}

export function parseConsolidationHistory(consolidationHistory) {
  assertCondition(consolidationHistory.version === 1, "Unsupported tidy store version");
  consolidationHistory.forgotten.forEach(parseRecordId);
  validateRecordRevisions(consolidationHistory.revisions, (consolidationRevision) => {
    if (consolidationRevision.snapshot !== null) parseRecordId(consolidationRevision.snapshot);
    validateRevisionCursor(consolidationRevision.cursor);
    consolidationRevision.memories.forEach(validateConsolidatedMemory);
    consolidationRevision.works.forEach(validateConsolidatedWorkState);
  });
  return consolidationHistory;
}

export function consolidationHistoryPath(projectLocation) {
  return join(projectLocation.projectDirectory, "tidy.json");
}

export function getLatestConsolidation(consolidationHistory) {
  return consolidationHistory?.revisions.at(-1) ?? { revision: 0, cursor: createRevisionCursor(), memories: [], works: [] };
}

export async function readConsolidationHistory(projectLocation) {
  return readStoredRecord(consolidationHistoryPath(projectLocation), parseConsolidationHistory);
}

export function calculateTidyStatus(sourceArchive, consolidation, nowMs = Date.now()) {
  const unprocessedRecords = findUnprocessedSources(sourceArchive, consolidation.cursor);
  const oldestPendingAt = unprocessedRecords.reduce((earliest, { recordedAt }) => Math.min(earliest, Date.parse(recordedAt)), Infinity);
  const dueReasons = [];
  if (unprocessedRecords.length >= 20) dueReasons.push("record-count");
  if (unprocessedRecords.length && nowMs - oldestPendingAt >= 24 * 60 * 60 * 1000) dueReasons.push("age");
  return { due: dueReasons.length > 0, revision: consolidation.revision, pendingRecords: unprocessedRecords.length,
    lastTidiedAt: consolidation.recordedAt ?? null, reasons: dueReasons };
}

function tidySnapshotPath(projectLocation, snapshotId) {
  return join(projectLocation.projectDirectory, "tidy-snapshots", `${snapshotId}.json`);
}

function collectMemoryBaseline(sourceArchive, consolidation, snapshotBounds = sourceArchive.bounds) {
  const memoriesById = new Map(consolidation.memories.map((memory) => [memory.id, memory]));
  for (const memoryRecord of sourceArchive.memories) {
    if (memoryRecord.forgotten || memoriesById.has(memoryRecord.id)) continue;
    const latestKnownRevision = getCursorRevision(snapshotBounds, "memory", memoryRecord.id);
    const latestKnownContent = memoryRecord.revisions.findLast(({ revision }) => revision <= latestKnownRevision);
    if (!latestKnownContent || latestKnownContent.revision <= getCursorRevision(consolidation.cursor, "memory", memoryRecord.id)) continue;
    const { text, reason, revision } = latestKnownContent;
    memoriesById.set(memoryRecord.id, { id: memoryRecord.id, scope: memoryRecord.scope, text, reason,
      status: "active", sources: [`memory:${memoryRecord.id}@${revision}`], supersedes: [] });
  }
  return [...memoriesById.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function prepareTidyBatch(projectLocation, batchLimit) {
  const [sourceArchive, consolidationHistory] = await Promise.all([
    readSourceArchive(projectLocation), readConsolidationHistory(projectLocation),
  ]);
  const consolidation = getLatestConsolidation(consolidationHistory);
  const unprocessedRecords = findUnprocessedSources(sourceArchive, consolidation.cursor);
  const batchRecords = unprocessedRecords.slice(0, batchLimit);
  const currentContext = {
    memories: collectMemoryBaseline(sourceArchive, consolidation).filter(({ status }) => status !== "retired"),
    works: consolidation.works,
    retired: consolidation.memories.filter(({ status }) => status === "retired")
      .map(({ id, scope, retirement }) => ({ id, scope, ...retirement })) };
  if (!batchRecords.length) return { snapshot: null, records: [], remaining: 0, current: currentContext };
  const snapshot = { version: 1, id: randomUUID(), baseRevision: consolidation.revision,
    bounds: sourceArchive.bounds,
    hashes: Object.fromEntries(batchRecords.map((source) => [source.ref, hashOriginalSource(source)])) };
  await updateStoredRecord({ path: tidySnapshotPath(projectLocation, snapshot.id), parse: parseTidySnapshot,
    update: () => snapshot });
  return { snapshot: snapshot.id, baseRevision: consolidation.revision, records: batchRecords,
    remaining: unprocessedRecords.length - batchRecords.length, current: currentContext };
}

function parseTidyChanges(input) {
  parseRecordId(input.snapshot);
  const changes = { snapshot: input.snapshot, memories: input.memories ?? [],
    works: input.works ?? [], retire: input.retire ?? [] };
  changes.memories = changes.memories.map(({ id, scope, text, reason, sources, status = "active", supersedes = [] }) => {
    const memory = { id, scope, text, reason, sources, status, supersedes };
    validateConsolidatedMemoryFields(memory);
    return memory;
  });
  changes.works = changes.works.map(({ id, goal, status, progress, evidence, next, sources }) => {
    const workState = { id, goal, status, progress, evidence, next, sources };
    validateConsolidatedWorkState(workState);
    return workState;
  });
  changes.retire = changes.retire.map(({ id, reason, sources }) => {
    const retirement = { id, reason, sources };
    validateMemoryRetirement(retirement);
    return retirement;
  });
  const memoryIds = [...changes.memories, ...changes.retire].map(({ id }) => id);
  assertCondition(new Set(memoryIds).size === memoryIds.length, "A memory cannot be written or retired twice");
  const workIds = changes.works.map(({ id }) => id);
  assertCondition(new Set(workIds).size === workIds.length, "A work cannot be written twice");
  return changes;
}

function sortObjectKeys(jsonValue) {
  if (Array.isArray(jsonValue)) return jsonValue.map(sortObjectKeys);
  if (jsonValue !== null && typeof jsonValue === "object") {
    return Object.fromEntries(Object.entries(jsonValue).sort(([a], [b]) => a.localeCompare(b))
      .map(([propertyName, propertyValue]) => [propertyName, sortObjectKeys(propertyValue)]));
  }
  return jsonValue;
}

function hashOriginalSource(originalSource) {
  const { latest, ...originalContent } = originalSource;
  return createHash("sha256").update(JSON.stringify(sortObjectKeys(originalContent))).digest("hex");
}

function assertSourceReferencesAvailable(sourceArchive, snapshot, changedEntries) {
  for (const changedEntry of changedEntries) {
    for (const ref of [...changedEntry.sources, ...(changedEntry.supersedes ?? []), ...(changedEntry.evidence ?? [])]) {
      const originalSource = requireSourceByReference(sourceArchive, ref);
      assertCondition(originalSource.revision <= getCursorRevision(snapshot.bounds, originalSource.kind, originalSource.id),
        `Source reference is newer than the snapshot: ${ref}`);
    }
  }
}

function applyMemoryChanges({ existingMemories, forgottenMemoryIds, memoryRecords }, changes) {
  const memoriesById = new Map(existingMemories.map((memory) => [memory.id, memory]));
  for (const memory of changes.memories) {
    assertCondition(!forgottenMemoryIds.includes(memory.id), `Memory ${memory.id} was forgotten; use a new ID`);
    const originalRecord = memoryRecords.find(({ id }) => id === memory.id);
    assertCondition(!originalRecord?.forgotten, `Memory ${memory.id} was forgotten; use a new ID`);
    const existingMemory = memoriesById.get(memory.id) ?? originalRecord;
    assertCondition(!existingMemory || isDeepStrictEqual(existingMemory.scope, memory.scope), "A memory's scope cannot change");
    memoriesById.set(memory.id, memory);
  }
  for (const { id, reason, sources } of changes.retire) {
    const retiredMemory = memoriesById.get(id);
    assertCondition(retiredMemory, `Cannot retire missing memory: ${id}`);
    memoriesById.set(id, { ...retiredMemory, status: "retired", retirement: { reason, sources } });
  }
  return [...memoriesById.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function applyTidyChanges(projectLocation, input) {
  const changes = parseTidyChanges(input);
  const snapshot = await readStoredRecord(tidySnapshotPath(projectLocation, changes.snapshot), createRecordParser(changes.snapshot, parseTidySnapshot));
  assertCondition(snapshot, "Tidy snapshot is missing or invalid");
  const requestHash = createHash("sha256").update(JSON.stringify(sortObjectKeys(changes))).digest("hex");
  const updatedHistory = await updateStoredRecord({ path: consolidationHistoryPath(projectLocation), parse: parseConsolidationHistory,
    async update(consolidationHistory) {
      const previousConsolidation = getLatestConsolidation(consolidationHistory);
      if (previousConsolidation.snapshot === snapshot.id && previousConsolidation.requestHash === requestHash) return consolidationHistory;
      assertCondition(previousConsolidation.revision === snapshot.baseRevision,
        `Tidy revision conflict: current revision is ${previousConsolidation.revision}; prepare a new snapshot and reconsider the changes`);
      const sourceArchive = await readSourceArchive(projectLocation);
      const preparedSources = Object.entries(snapshot.hashes).map(([ref, hash]) => {
        const originalSource = sourceArchive.sources.find(({ ref: sourceRef }) => sourceRef === ref);
        assertCondition(originalSource, `Snapshot source is missing or forgotten: ${ref}`);
        assertCondition(hash === hashOriginalSource(originalSource), `Snapshot source changed or was forgotten: ${ref}`);
        return originalSource;
      });
      assertSourceReferencesAvailable(sourceArchive, snapshot, [...changes.memories, ...changes.works, ...changes.retire]);
      const knownWorkIds = new Set([...sourceArchive.checkpoints, ...sourceArchive.journals].map(({ id }) => id));
      for (const workState of changes.works) assertCondition(knownWorkIds.has(workState.id), `Unknown work: ${workState.id}`);
      const memories = applyMemoryChanges({ existingMemories: collectMemoryBaseline(sourceArchive, previousConsolidation, snapshot.bounds),
        forgottenMemoryIds: consolidationHistory?.forgotten ?? [], memoryRecords: sourceArchive.memories }, changes);
      const workStatesById = new Map(previousConsolidation.works.map((workState) => [workState.id, workState]));
      for (const workState of changes.works) workStatesById.set(workState.id, workState);
      const consolidationRevision = { revision: previousConsolidation.revision + 1, recordedAt: new Date().toISOString(),
        snapshot: snapshot.id, requestHash, cursor: advanceRevisionCursor(previousConsolidation.cursor, preparedSources), memories,
        works: [...workStatesById.values()].sort((a, b) => a.id.localeCompare(b.id)) };
      return { version: 1, forgotten: consolidationHistory?.forgotten ?? [],
        revisions: [...(consolidationHistory?.revisions ?? []), consolidationRevision] };
    } });
  return getLatestConsolidation(updatedHistory);
}

function pruneMemoryAfterErasure(memory, erasure) {
  if (memory.id === erasure.memoryId ||
    [...memory.sources, ...(memory.retirement?.sources ?? [])].some(erasure.matchesReference)) return null;
  return { ...memory, supersedes: (memory.supersedes ?? []).filter((ref) => !erasure.matchesReference(ref)) };
}

export function eraseFromConsolidationHistory(consolidationHistory, { memoryId, sourceRef: erasedSourceRef, expectedRevision }) {
  if (!consolidationHistory) {
    assertCondition(expectedRevision === undefined, `Memory does not exist: ${memoryId}`);
    return null;
  }
  const consolidation = getLatestConsolidation(consolidationHistory);
  if (expectedRevision !== undefined) {
    assertCondition(consolidation.revision === expectedRevision || consolidationHistory.forgotten.includes(memoryId),
      `Tidy revision conflict: current revision is ${consolidation.revision}`);
    assertCondition(consolidation.memories.some((memory) => memory.id === memoryId) || consolidationHistory.forgotten.includes(memoryId),
      `Memory does not exist: ${memoryId}`);
  }
  const matchesReference = memoryId === undefined ? (ref) => ref === erasedSourceRef : (ref) => ref.startsWith(`memory:${memoryId}@`);
  const sanitizedRevisions = consolidationHistory.revisions.map((consolidationRevision) => ({ ...consolidationRevision,
    memories: consolidationRevision.memories.map((memory) => pruneMemoryAfterErasure(memory, { memoryId, matchesReference })).filter(Boolean),
    works: consolidationRevision.works.filter((workState) => ![...workState.sources, ...workState.evidence].some(matchesReference)) }));
  const forgottenMemoryIds = memoryId === undefined ? consolidationHistory.forgotten : [...new Set([...consolidationHistory.forgotten, memoryId])];
  if (isDeepStrictEqual(consolidationHistory.revisions, sanitizedRevisions) &&
    isDeepStrictEqual(consolidationHistory.forgotten, forgottenMemoryIds)) return consolidationHistory;
  const latestSanitized = sanitizedRevisions.at(-1);
  return { version: 1, forgotten: forgottenMemoryIds, revisions: [...sanitizedRevisions, { ...latestSanitized,
    revision: consolidation.revision + 1, recordedAt: new Date().toISOString(), snapshot: null, requestHash: null }] };
}
