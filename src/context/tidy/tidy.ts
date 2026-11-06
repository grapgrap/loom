import type { ProjectLocation } from "../storage/store.ts";
import type { TidyPreparationOptions } from "./model.ts";
import type { SourceArchive } from "../sources/model.ts";
import type { Consolidation, TidyChanges } from "./model.ts";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createRecordParser } from "../records/records.ts";
import { findUnprocessedSources, readSourceArchive } from "../sources/sources.ts";
import { updateStoredRecord, readStoredRecord } from "../storage/store.ts";
import { emptyGraph } from "../graph/graph.ts";
import { presentWork } from "../work/work.ts";
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
  limit: number,
  offset: number,
  matchesSelection: ReturnType<typeof contextSelection>,
  full?: boolean,
) {
  const legacyWorks = consolidation.works.filter(
    (work) => !(archive.works ?? []).some(({ id }) => id === work.id),
  );
  const memories = collectMemoryBaseline(archive, consolidation).filter(
    (memory) =>
      memory.status !== "retired" && memory.status !== "absorbed" && matchesSelection(memory),
  );
  const selectedWorks = legacyWorks.filter((entry) =>
    matchesSelection({ ...entry, scope: { type: "work", id: entry.id } }),
  );
  const managedWorks = (archive.works ?? [])
    .map((record) => presentWork(record.revisions.at(-1)!))
    .filter((entry) =>
      matchesSelection({ ...entry, workScope: entry.scope, scope: { type: "work", id: entry.id } }),
    );
  const retired = consolidation.memories
    .filter((entry) => entry.status === "retired" && matchesSelection(entry))
    .map(({ id, scope, retirement }) => ({ id, scope, ...retirement }));
  const end = offset + limit;
  return {
    memories: memories.slice(offset, end),
    memoriesRemaining: Math.max(0, memories.length - end),
    works: selectedWorks.slice(offset, end),
    worksRemaining: Math.max(0, selectedWorks.length - end),
    managedWorks: managedWorks.slice(offset, end),
    managedWorksRemaining: Math.max(0, managedWorks.length - end),
    retired: retired.slice(offset, end),
    retiredRemaining: Math.max(0, retired.length - end),
    ...(full ? { graph: consolidation.graph ?? emptyGraph() } : {}),
  };
}

export async function prepareTidyBatch(
  location: ProjectLocation,
  { limit = 50, offset = 0, work, query, full }: TidyPreparationOptions,
) {
  const [archive, history] = await Promise.all([
    readSourceArchive(location),
    readConsolidationHistory(location),
  ]);
  const consolidation = getLatestConsolidation(history);
  const matchesSelection = contextSelection({ work, query });
  const pending = findUnprocessedSources(archive, consolidation.cursor).filter(matchesSelection);
  const records = pending.slice(0, limit);
  const current = currentPage(archive, consolidation, limit, offset, matchesSelection, full);
  const review = current.memories;
  if (!records.length && !review.length)
    return { snapshot: null, records: [], remaining: 0, current };
  const snapshot = {
    version: 2,
    id: randomUUID(),
    baseRevision: consolidation.revision,
    bounds: archive.bounds,
    hashes: Object.fromEntries(records.map((source) => [source.ref, hashOriginalSource(source)])),
    memoryIds: review.map(({ id }) => id),
  };
  await updateStoredRecord({
    path: snapshotPath(location, snapshot.id),
    parse: parseTidySnapshot,
    update: () => snapshot,
  });
  return {
    snapshot: snapshot.id,
    baseRevision: consolidation.revision,
    records,
    remaining: pending.length - records.length,
    current,
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

export async function applyTidyChanges(location: ProjectLocation, input: unknown) {
  const changes = parseTidyChanges(input);
  const snapshot = await readStoredRecord(
    snapshotPath(location, changes.snapshot),
    createRecordParser(changes.snapshot, parseTidySnapshot),
  );
  if (!snapshot) throw new Error("Tidy snapshot is missing or invalid");
  const requestHash = hashChanges(changes);
  const history = await updateStoredRecord({
    path: consolidationHistoryPath(location),
    parse: parseConsolidationHistory,
    async update(previous) {
      const current = getLatestConsolidation(previous);
      if (current.snapshot === snapshot.id && current.requestHash === requestHash) return previous!;
      assertTidyRevision(current, snapshot);
      const archive = await readSourceArchive(location);
      const prepared = validatePreparedSources(archive, snapshot, changes);
      return buildConsolidation(
        { history: previous, archive, snapshot, prepared, recordedAt: new Date().toISOString() },
        changes,
      );
    },
  });
  return appliedChanges(getLatestConsolidation(history), changes);
}
