import type {
  SourceKind,
  SourceReference,
  SourceArchive,
  Cursor,
  OriginalSource,
} from "./model.ts";
import type { Scope } from "../model.ts";
import type {
  StoredMemory,
  MemoryRecord,
  CheckpointRecord,
  WorkJournal,
} from "../records/model.ts";
import type { WorkLedger, WorkRevision } from "../work/model.ts";
import type { ProjectLocation } from "../storage/store.ts";
import { join } from "node:path";
import {
  parseCheckpointRecord,
  parseMemoryRecord,
  parseRecordId,
  createRecordParser,
  parseRevisionNumber,
  validateArray,
} from "../records/records.ts";
import { workJournalPath, parseWorkJournal } from "../records/journal.ts";
import { readDirectoryEntries, readStoredRecord } from "../storage/store.ts";
import { readWorkLedger } from "../work/store.ts";
import { presentWork } from "../work/work.ts";

export function memoryRecordPath(location: ProjectLocation, memoryId: string) {
  return join(location.projectDirectory, "context", `${memoryId}.json`);
}

export function checkpointRecordPath(location: ProjectLocation, workId: string) {
  return join(location.projectDirectory, "works", workId, "checkpoint.json");
}

export function parseSourceReference(reference: string): SourceReference {
  const referenceParts = /^(memory|checkpoint|note|work):([^@]+)@([1-9][0-9]*)$/.exec(reference);
  if (!referenceParts) throw new Error(`Invalid source reference: ${reference}`);
  const [, kind, recordId, revisionText] = referenceParts;
  return {
    kind: kind as SourceKind,
    id: parseRecordId(recordId),
    revision: parseRevisionNumber(Number(revisionText)),
  };
}

export function validateSourceReferences(refs: unknown, label: string): asserts refs is string[] {
  validateArray(refs, label);
  refs.forEach((ref) => parseSourceReference(ref as string));
  if (new Set(refs).size !== refs.length) throw new Error(`${label} contains duplicate references`);
}

export function validateRequiredSourceReferences(
  refs: unknown,
  label: string,
): asserts refs is string[] {
  validateSourceReferences(refs, label);
  if (!refs.length) throw new Error(`${label} must contain at least one reference`);
}

export function collectKnownWorkIds(archive: SourceArchive) {
  const workIds = [...archive.checkpoints, ...archive.journals, ...(archive.works ?? [])].map(
    ({ id }) => id,
  );
  for (const memory of archive.memories) {
    if (memory.forgotten || memory.scope.type !== "work") continue;
    workIds.push(memory.scope.id);
  }
  return new Set(workIds);
}

export async function readSource(location: ProjectLocation, reference: string) {
  const { kind, id, revision } = parseSourceReference(reference);
  if (kind === "work") {
    const ledger = await readWorkLedger(location);
    const record = ledger?.works.find((work) => work.id === id);
    const work = record?.revisions.find((entry) => entry.revision === revision);
    if (!work) throw new Error(`Source reference is missing or forgotten: ${reference}`);
    return {
      kind,
      ...presentWork(work),
      workScope: work.scope,
      scope: { type: "work", id },
      latest: revision === record!.revisions.at(-1)!.revision,
    };
  }
  const [path, parse] =
    kind === "memory"
      ? [memoryRecordPath(location, id), parseMemoryRecord]
      : kind === "checkpoint"
        ? [checkpointRecordPath(location, id), parseCheckpointRecord]
        : [workJournalPath(location, id), parseWorkJournal];
  const record = await readStoredRecord(
    path,
    createRecordParser<StoredMemory | CheckpointRecord | WorkJournal>(id, parse),
  );
  const source =
    record && "forgotten" in record && record.forgotten
      ? undefined
      : (record as MemoryRecord | CheckpointRecord | WorkJournal | null)?.revisions.find(
          (entry) => entry.revision === revision,
        );
  if (!source || ("forgotten" in source && source.forgotten))
    throw new Error(`Source reference is missing or forgotten: ${reference}`);
  return {
    kind,
    id,
    scope: kind === "memory" ? (record as MemoryRecord).scope : { type: "work", id },
    ...source,
    ref: reference,
    ...(kind === "note"
      ? {}
      : {
          latest:
            revision === (record as MemoryRecord | CheckpointRecord).revisions.at(-1)!.revision,
        }),
  };
}

export function createRevisionCursor(): Cursor {
  return { memory: {}, checkpoint: {}, note: {} };
}

export function getCursorRevision(
  revisionCursor: Cursor,
  sourceKind: SourceKind,
  recordId: string,
) {
  return Object.hasOwn(revisionCursor[sourceKind] ?? {}, recordId)
    ? revisionCursor[sourceKind]![recordId]
    : 0;
}

export function advanceRevisionCursor(
  revisionCursor: Cursor,
  sources: { kind: SourceKind; id: string; revision: number }[],
) {
  const advancedCursor = structuredClone(revisionCursor);
  for (const { kind, id, revision } of sources) {
    advancedCursor[kind] ??= {};
    advancedCursor[kind][id] = Math.max(getCursorRevision(advancedCursor, kind, id), revision);
  }
  return advancedCursor;
}

export async function readSourceArchive(location: ProjectLocation): Promise<SourceArchive> {
  const workLedger = await readWorkLedger(location);
  const memoryRecords: StoredMemory[] = [];
  const checkpointRecords: CheckpointRecord[] = [];
  const workJournals: WorkJournal[] = [];
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
  const sources: OriginalSource[] = [];
  for (const [kind, sourceRecords] of [
    ["memory", memoryRecords],
    ["checkpoint", checkpointRecords],
    ["note", workJournals],
    ["work", workLedger?.works ?? []],
  ] as const) {
    for (const sourceRecord of sourceRecords) {
      if ("forgotten" in sourceRecord && sourceRecord.forgotten) {
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
      const scope =
        kind === "memory"
          ? (sourceRecord as MemoryRecord).scope
          : { type: "work", id: sourceRecord.id };
      for (const sourceRevision of (
        sourceRecord as MemoryRecord | CheckpointRecord | WorkJournal | WorkLedger["works"][number]
      ).revisions) {
        sources.push({
          kind,
          id: sourceRecord.id,
          scope,
          ...sourceRevision,
          ...(kind === "work" ? { workScope: (sourceRevision as WorkRevision).scope, scope } : {}),
          ref: `${kind}:${sourceRecord.id}@${sourceRevision.revision}`,
          ...(kind === "note"
            ? {}
            : {
                latest:
                  sourceRevision.revision ===
                  (sourceRecord as MemoryRecord).revisions.at(-1)!.revision,
              }),
        } as OriginalSource);
      }
    }
  }
  return {
    memories: memoryRecords,
    checkpoints: checkpointRecords,
    journals: workJournals,
    works: workLedger?.works ?? [],
    sources,
    bounds: advanceRevisionCursor(createRevisionCursor(), sources),
  };
}

export function findUnprocessedSources<
  T extends { kind: SourceKind; id: string; revision: number },
>(archive: { sources: T[] }, processedCursor = createRevisionCursor()) {
  return archive.sources.filter(
    ({ kind, id, revision }) => revision > getCursorRevision(processedCursor, kind, id),
  );
}

export function requireSourceByReference(archive: SourceArchive, reference: string) {
  const source = archive.sources.find(({ ref }) => ref === reference);
  if (!source || ("forgotten" in source && source.forgotten))
    throw new Error(`Source reference is missing or forgotten: ${reference}`);
  return source;
}

export function matchesContextScope(scopedEntry: { scope?: Scope }, workId?: string) {
  return (
    scopedEntry.scope?.type === "project" ||
    (workId !== undefined && scopedEntry.scope?.type === "work" && scopedEntry.scope.id === workId)
  );
}
