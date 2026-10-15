import { join } from "node:path";
import {
  parseCheckpointRecord, parseMemoryRecord, parseRecordId, createRecordParser, parseRevisionNumber,
} from "./records.mjs";
import { workJournalPath, parseWorkJournal } from "./journal.mjs";
import { readDirectoryEntries, readStoredRecord } from "./store.mjs";

export function memoryRecordPath(projectLocation, memoryId) {
  return join(projectLocation.projectDirectory, "context", `${memoryId}.json`);
}

export function checkpointRecordPath(projectLocation, workId) {
  return join(projectLocation.projectDirectory, "works", workId, "checkpoint.json");
}

export function parseSourceReference(reference) {
  const referenceParts = /^(memory|checkpoint|note):([^@]+)@([1-9][0-9]*)$/.exec(reference);
  if (!referenceParts) throw new Error(`Invalid source reference: ${reference}`);
  const [, kind, recordId, revisionText] = referenceParts;
  return { kind, id: parseRecordId(recordId), revision: parseRevisionNumber(Number(revisionText)) };
}

export function createRevisionCursor() {
  return { memory: {}, checkpoint: {}, note: {} };
}

export function getCursorRevision(revisionCursor, sourceKind, recordId) {
  return Object.hasOwn(revisionCursor[sourceKind], recordId) ? revisionCursor[sourceKind][recordId] : 0;
}

export function advanceRevisionCursor(revisionCursor, originalSources) {
  const advancedCursor = structuredClone(revisionCursor);
  for (const { kind, id, revision } of originalSources) {
    advancedCursor[kind][id] = Math.max(getCursorRevision(advancedCursor, kind, id), revision);
  }
  return advancedCursor;
}

export async function readSourceArchive(projectLocation) {
  const memoryRecords = [];
  const checkpointRecords = [];
  const workJournals = [];
  const memoryFiles = await readDirectoryEntries(join(projectLocation.projectDirectory, "context"));
  for (const memoryFile of memoryFiles.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!memoryFile.isFile() || !memoryFile.name.endsWith(".json")) continue;
    const memoryId = parseRecordId(memoryFile.name.slice(0, -5));
    const memoryRecord = await readStoredRecord(memoryRecordPath(projectLocation, memoryId), createRecordParser(memoryId, parseMemoryRecord));
    if (memoryRecord) memoryRecords.push(memoryRecord);
  }
  const workDirectories = await readDirectoryEntries(join(projectLocation.projectDirectory, "works"));
  for (const workDirectory of workDirectories.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!workDirectory.isDirectory()) continue;
    const workId = parseRecordId(workDirectory.name);
    const checkpointRecord = await readStoredRecord(checkpointRecordPath(projectLocation, workId), createRecordParser(workId, parseCheckpointRecord));
    const workJournal = await readStoredRecord(workJournalPath(projectLocation, workId), createRecordParser(workId, parseWorkJournal));
    if (checkpointRecord) checkpointRecords.push(checkpointRecord);
    if (workJournal) workJournals.push(workJournal);
  }
  const originalSources = [];
  for (const [kind, sourceRecords] of [["memory", memoryRecords], ["checkpoint", checkpointRecords], ["note", workJournals]]) {
    for (const sourceRecord of sourceRecords) {
      if (sourceRecord.forgotten) {
        originalSources.push({ kind, id: sourceRecord.id, ref: `${kind}:${sourceRecord.id}@${sourceRecord.revision}`,
          revision: sourceRecord.revision, recordedAt: sourceRecord.recordedAt, forgotten: true });
        continue;
      }
      const scope = kind === "memory" ? sourceRecord.scope : { type: "work", id: sourceRecord.id };
      for (const sourceRevision of sourceRecord.revisions) {
        originalSources.push({ kind, id: sourceRecord.id, scope, ...sourceRevision,
          ref: `${kind}:${sourceRecord.id}@${sourceRevision.revision}`,
          ...(kind === "note" ? {} : { latest: sourceRevision.revision === sourceRecord.revisions.at(-1).revision }) });
      }
    }
  }
  return { memories: memoryRecords, checkpoints: checkpointRecords, journals: workJournals,
    sources: originalSources, bounds: advanceRevisionCursor(createRevisionCursor(), originalSources) };
}

export function findUnprocessedSources(sourceArchive, processedCursor = createRevisionCursor()) {
  return sourceArchive.sources.filter(({ kind, id, revision }) => revision > getCursorRevision(processedCursor, kind, id));
}

export function requireSourceByReference(sourceArchive, sourceReference) {
  const originalSource = sourceArchive.sources.find(({ ref }) => ref === sourceReference);
  if (!originalSource || originalSource.forgotten) throw new Error(`Source reference is missing or forgotten: ${sourceReference}`);
  return originalSource;
}

export function matchesContextScope(scopedEntry, workId) {
  return scopedEntry.scope?.type === "project" ||
    (workId !== undefined && scopedEntry.scope?.type === "work" && scopedEntry.scope.id === workId);
}
