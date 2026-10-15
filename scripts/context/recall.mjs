import { presentLatestRevision } from "./records.mjs";
import { getCursorRevision, findUnprocessedSources, readSourceArchive, matchesContextScope } from "./sources.mjs";
import { getLatestConsolidation, readConsolidationHistory, calculateTidyStatus } from "./tidy.mjs";

function presentConsolidatedEntry(consolidatedEntry, { consolidation, consolidationHistory, includeHistory, collectionName }) {
  const recalledEntry = { ...consolidatedEntry, revision: consolidation.revision, recordedAt: consolidation.recordedAt,
    source: { type: "agent", reference: `tidy revision ${consolidation.revision}; sources: ${consolidatedEntry.sources.join(", ")}` } };
  if (includeHistory) recalledEntry.history = consolidationHistory.revisions.slice(0, -1)
    .flatMap((previousConsolidation) => previousConsolidation[collectionName].filter(({ id }) => id === consolidatedEntry.id)
      .map((previousEntry) => ({ ...previousEntry, revision: previousConsolidation.revision, recordedAt: previousConsolidation.recordedAt })));
  return recalledEntry;
}

export async function recallContext(projectLocation, options) {
  const [sourceArchive, consolidationHistory] = await Promise.all([
    readSourceArchive(projectLocation), readConsolidationHistory(projectLocation),
  ]);
  const consolidation = getLatestConsolidation(consolidationHistory);
  const availableSourceRefs = new Set(sourceArchive.sources.filter(({ forgotten }) => !forgotten).map(({ ref }) => ref));
  const queryWords = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const currentMemories = consolidationHistory
    ? consolidation.memories.filter((memory) => memory.status !== "retired" &&
      memory.sources.every((ref) => availableSourceRefs.has(ref)))
      .map((memory) => presentConsolidatedEntry(memory,
        { consolidation, consolidationHistory, includeHistory: options.history, collectionName: "memories" }))
    : sourceArchive.memories.filter(({ forgotten }) => !forgotten).map((memory) => presentLatestRevision(memory, options.history));
  if (consolidationHistory) {
    const consolidatedMemoryIds = new Set(consolidation.memories.map(({ id }) => id));
    for (const memoryRecord of sourceArchive.memories) {
      if (!memoryRecord.forgotten && !consolidatedMemoryIds.has(memoryRecord.id) &&
        memoryRecord.revisions.at(-1).revision > getCursorRevision(consolidation.cursor, "memory", memoryRecord.id)) {
        currentMemories.push({ ...presentLatestRevision(memoryRecord, options.history), unconsolidated: true });
      }
    }
  }
  const recalledMemories = currentMemories.filter((memory) => matchesContextScope(memory, options.work))
    .filter(({ text, reason }) => queryWords.every((word) => `${text}\n${reason}`.toLowerCase().includes(word)));
  const workStatesById = new Map(sourceArchive.checkpoints.map((checkpoint) => [checkpoint.id, presentLatestRevision(checkpoint, options.history)]));
  for (const workState of consolidation.works) {
    if (workState.sources.every((ref) => availableSourceRefs.has(ref))) {
      workStatesById.set(workState.id, presentConsolidatedEntry(workState,
        { consolidation, consolidationHistory, includeHistory: options.history, collectionName: "works" }));
    }
  }
  const workSummariesById = new Map([...workStatesById.values()].map(({ id, goal, status, revision, recordedAt }) =>
    [id, { id, goal, status, revision, recordedAt }]));
  for (const workJournal of sourceArchive.journals) {
    const latestNote = workJournal.revisions.at(-1);
    const workSummary = workSummariesById.get(workJournal.id);
    workSummariesById.set(workJournal.id, { ...(workSummary ?? { id: workJournal.id, goal: null, status: null,
      revision: latestNote.revision, recordedAt: latestNote.recordedAt }), latestRecordAt: latestNote.recordedAt });
  }
  const pendingRecords = findUnprocessedSources(sourceArchive, consolidation.cursor).filter((source) =>
    !source.forgotten && matchesContextScope(source, options.work) &&
    (source.kind === "note" || (consolidationHistory && source.latest)));
  return { ...projectLocation, memories: recalledMemories,
    works: [...workSummariesById.values()].sort((leftWork, rightWork) =>
      (rightWork.latestRecordAt ?? rightWork.recordedAt).localeCompare(leftWork.latestRecordAt ?? leftWork.recordedAt) ||
      leftWork.id.localeCompare(rightWork.id)),
    work: workStatesById.get(options.work) ?? null,
    pending: pendingRecords.slice(0, options.limit), pendingRemaining: Math.max(0, pendingRecords.length - options.limit),
    tidy: calculateTidyStatus(sourceArchive, consolidation) };
}
