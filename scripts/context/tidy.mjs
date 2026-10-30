import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createRecordParser } from "./records.mjs";
import { findUnprocessedSources, matchesContextScope, readSourceArchive } from "./sources.mjs";
import { extractSearchText } from "./search.mjs";
import { updateStoredRecord, readStoredRecord } from "./store.mjs";
import { emptyGraph } from "./graph.mjs";
import { presentWork } from "./work.mjs";
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
} from "./consolidation.mjs";

export function consolidationHistoryPath(location) {
  return join(location.projectDirectory, "tidy.json");
}

export async function readConsolidationHistory(location) {
  return readStoredRecord(consolidationHistoryPath(location), parseConsolidationHistory);
}

function snapshotPath(location, id) {
  return join(location.projectDirectory, "tidy-snapshots", `${id}.json`);
}

function currentPage(archive, consolidation, limit, offset, matchesSelection) {
  const legacyWorks = consolidation.works.filter(
    (work) => !(archive.works ?? []).some(({ id }) => id === work.id),
  );
  const memories = collectMemoryBaseline(archive, consolidation).filter(
    (memory) =>
      memory.status !== "retired" && memory.status !== "absorbed" && matchesSelection(memory),
  );
  const retired = consolidation.memories
    .filter(({ status }) => status === "retired")
    .map(({ id, scope, retirement }) => ({ id, scope, ...retirement }));
  const end = offset + limit;
  return {
    memories: memories.slice(offset, end),
    memoriesRemaining: Math.max(0, memories.length - end),
    works: legacyWorks.slice(offset, end),
    worksRemaining: Math.max(0, legacyWorks.length - end),
    managedWorks: (archive.works ?? [])
      .slice(offset, end)
      .map((record) => presentWork(record.revisions.at(-1))),
    managedWorksRemaining: Math.max(0, (archive.works ?? []).length - end),
    retired: retired.slice(offset, end),
    retiredRemaining: Math.max(0, retired.length - end),
    graph: consolidation.graph ?? emptyGraph(),
  };
}

export async function prepareTidyBatch(location, { limit, offset = 0, revisit, work, query }) {
  const [archive, history] = await Promise.all([
    readSourceArchive(location),
    readConsolidationHistory(location),
  ]);
  const consolidation = getLatestConsolidation(history);
  const queryWords = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSelection = (entry) =>
    (work === undefined || matchesContextScope(entry, work)) &&
    queryWords.every((word) => extractSearchText(entry).toLowerCase().includes(word));
  const pending = findUnprocessedSources(archive, consolidation.cursor).filter(matchesSelection);
  const records = pending.slice(0, limit);
  const current = currentPage(archive, consolidation, limit, offset, matchesSelection);
  const review = revisit ? current.memories : [];
  if (!records.length && !review.length)
    return { snapshot: null, records: [], remaining: 0, current };
  const snapshot = {
    version: revisit ? 2 : 1,
    id: randomUUID(),
    baseRevision: consolidation.revision,
    bounds: archive.bounds,
    hashes: Object.fromEntries(records.map((source) => [source.ref, hashOriginalSource(source)])),
    ...(revisit ? { memoryIds: review.map(({ id }) => id) } : {}),
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

function appliedChanges(current, changes) {
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

export async function applyTidyChanges(location, input) {
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
      if (current.snapshot === snapshot.id && current.requestHash === requestHash) return previous;
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
