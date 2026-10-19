import { join } from "node:path";
import {
  parseCheckpointRecord,
  parseMemoryRecord,
  parseRecordId,
  createRecordParser,
  parseRevisionNumber,
  validateArray,
} from "./records.mjs";
import { workJournalPath, parseWorkJournal } from "./journal.mjs";
import { readDirectoryEntries, readStoredRecord } from "./store.mjs";

export function memoryRecordPath(location, memoryId) {
  return join(location.projectDirectory, "context", `${memoryId}.json`);
}

export function checkpointRecordPath(location, workId) {
  return join(location.projectDirectory, "works", workId, "checkpoint.json");
}

export function parseSourceReference(reference) {
  const referenceParts = /^(memory|checkpoint|note):([^@]+)@([1-9][0-9]*)$/.exec(reference);
  if (!referenceParts) throw new Error(`Invalid source reference: ${reference}`);
  const [, kind, recordId, revisionText] = referenceParts;
  return { kind, id: parseRecordId(recordId), revision: parseRevisionNumber(Number(revisionText)) };
}

export function validateSourceReferences(refs, label) {
  validateArray(refs, label);
  refs.forEach((ref) => parseSourceReference(ref));
  if (new Set(refs).size !== refs.length) throw new Error(`${label} contains duplicate references`);
}

export function validateRequiredSourceReferences(refs, label) {
  validateSourceReferences(refs, label);
  if (!refs.length) throw new Error(`${label} must contain at least one reference`);
}

export function collectKnownWorkIds(archive) {
  const workIds = [...archive.checkpoints, ...archive.journals].map(({ id }) => id);
  for (const memory of archive.memories) {
    if (memory.forgotten || memory.scope.type !== "work") continue;
    workIds.push(memory.scope.id);
  }
  return new Set(workIds);
}

export async function readSource(location, reference) {
  const { kind, id, revision } = parseSourceReference(reference);
  const [path, parse] =
    kind === "memory"
      ? [memoryRecordPath(location, id), parseMemoryRecord]
      : kind === "checkpoint"
        ? [checkpointRecordPath(location, id), parseCheckpointRecord]
        : [workJournalPath(location, id), parseWorkJournal];
  const record = await readStoredRecord(path, createRecordParser(id, parse));
  const source = record?.forgotten
    ? undefined
    : record?.revisions.find((entry) => entry.revision === revision);
  if (!source || source.forgotten)
    throw new Error(`Source reference is missing or forgotten: ${reference}`);
  return {
    kind,
    id,
    scope: kind === "memory" ? record.scope : { type: "work", id },
    ...source,
    ref: reference,
    ...(kind === "note" ? {} : { latest: revision === record.revisions.at(-1).revision }),
  };
}

export function createRevisionCursor() {
  return { memory: {}, checkpoint: {}, note: {} };
}

export function getCursorRevision(revisionCursor, sourceKind, recordId) {
  return Object.hasOwn(revisionCursor[sourceKind], recordId)
    ? revisionCursor[sourceKind][recordId]
    : 0;
}

export function advanceRevisionCursor(revisionCursor, sources) {
  const advancedCursor = structuredClone(revisionCursor);
  for (const { kind, id, revision } of sources) {
    advancedCursor[kind][id] = Math.max(getCursorRevision(advancedCursor, kind, id), revision);
  }
  return advancedCursor;
}

export async function readSourceArchive(location) {
  const memoryRecords = [];
  const checkpointRecords = [];
  const workJournals = [];
  const memoryFiles = await readDirectoryEntries(join(location.projectDirectory, "context"));
  for (const memoryFile of memoryFiles.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!memoryFile.isFile() || !memoryFile.name.endsWith(".json")) continue;
    const memoryId = parseRecordId(memoryFile.name.slice(0, -5));
    const memoryRecord = await readStoredRecord(
      memoryRecordPath(location, memoryId),
      createRecordParser(memoryId, parseMemoryRecord),
    );
    if (memoryRecord) memoryRecords.push(memoryRecord);
  }
  const workDirectories = await readDirectoryEntries(join(location.projectDirectory, "works"));
  for (const workDirectory of workDirectories.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!workDirectory.isDirectory()) continue;
    const workId = parseRecordId(workDirectory.name);
    const checkpointRecord = await readStoredRecord(
      checkpointRecordPath(location, workId),
      createRecordParser(workId, parseCheckpointRecord),
    );
    const workJournal = await readStoredRecord(
      workJournalPath(location, workId),
      createRecordParser(workId, parseWorkJournal),
    );
    if (checkpointRecord) checkpointRecords.push(checkpointRecord);
    if (workJournal) workJournals.push(workJournal);
  }
  const sources = [];
  for (const [kind, sourceRecords] of [
    ["memory", memoryRecords],
    ["checkpoint", checkpointRecords],
    ["note", workJournals],
  ]) {
    for (const sourceRecord of sourceRecords) {
      if (sourceRecord.forgotten) {
        sources.push({
          kind,
          id: sourceRecord.id,
          ref: `${kind}:${sourceRecord.id}@${sourceRecord.revision}`,
          revision: sourceRecord.revision,
          recordedAt: sourceRecord.recordedAt,
          forgotten: true,
        });
        continue;
      }
      const scope = kind === "memory" ? sourceRecord.scope : { type: "work", id: sourceRecord.id };
      for (const sourceRevision of sourceRecord.revisions) {
        sources.push({
          kind,
          id: sourceRecord.id,
          scope,
          ...sourceRevision,
          ref: `${kind}:${sourceRecord.id}@${sourceRevision.revision}`,
          ...(kind === "note"
            ? {}
            : { latest: sourceRevision.revision === sourceRecord.revisions.at(-1).revision }),
        });
      }
    }
  }
  return {
    memories: memoryRecords,
    checkpoints: checkpointRecords,
    journals: workJournals,
    sources,
    bounds: advanceRevisionCursor(createRevisionCursor(), sources),
  };
}

export function findUnprocessedSources(archive, processedCursor = createRevisionCursor()) {
  return archive.sources.filter(
    ({ kind, id, revision }) => revision > getCursorRevision(processedCursor, kind, id),
  );
}

export function requireSourceByReference(archive, reference) {
  const source = archive.sources.find(({ ref }) => ref === reference);
  if (!source || source.forgotten)
    throw new Error(`Source reference is missing or forgotten: ${reference}`);
  return source;
}

export function matchesContextScope(scopedEntry, workId) {
  return (
    scopedEntry.scope?.type === "project" ||
    (workId !== undefined && scopedEntry.scope?.type === "work" && scopedEntry.scope.id === workId)
  );
}
