import { presentLatestRevision } from "./records.mjs";
import {
  getCursorRevision,
  findUnprocessedSources,
  readSourceArchive,
  matchesContextScope,
} from "./sources.mjs";
import { readConsolidationHistory } from "./tidy.mjs";
import { getLatestConsolidation, calculateTidyStatus } from "./consolidation.mjs";
import { queryGraph } from "./graph-query.mjs";

const noteExcerptLength = 300;

function presentEntry(entry, { current, history, includeHistory, collection }) {
  const result = {
    ...entry,
    revision: current.revision,
    recordedAt: current.recordedAt,
    source: {
      type: "agent",
      reference: `tidy revision ${current.revision}; sources: ${entry.sources.join(", ")}`,
    },
  };
  if (includeHistory)
    result.history = history.revisions.slice(0, -1).flatMap((previous) =>
      previous[collection]
        .filter(({ id }) => id === entry.id)
        .map((version) => ({
          ...version,
          revision: previous.revision,
          recordedAt: previous.recordedAt,
        })),
    );
  return result;
}

function restoreMemories(archive, history, presentation) {
  if (!history)
    return archive.memories
      .filter(({ forgotten }) => !forgotten)
      .map((memory) => presentLatestRevision(memory, presentation.includeHistory));
  const { current, availableRefs } = presentation;
  const memories = current.memories
    .filter(
      (memory) =>
        memory.status !== "retired" && memory.sources.every((ref) => availableRefs.has(ref)),
    )
    .map((memory) => presentEntry(memory, { ...presentation, collection: "memories" }));
  const consolidatedIds = new Set(current.memories.map(({ id }) => id));
  for (const memory of archive.memories) {
    if (
      !memory.forgotten &&
      !consolidatedIds.has(memory.id) &&
      memory.revisions.at(-1).revision > getCursorRevision(current.cursor, "memory", memory.id)
    ) {
      memories.push({
        ...presentLatestRevision(memory, presentation.includeHistory),
        unconsolidated: true,
      });
    }
  }
  return memories;
}

function restoreWorks(archive, presentation) {
  const works = new Map(
    archive.checkpoints.map((checkpoint) => [
      checkpoint.id,
      presentLatestRevision(checkpoint, presentation.includeHistory),
    ]),
  );
  for (const work of presentation.current.works) {
    if (work.sources.every((ref) => presentation.availableRefs.has(ref))) {
      works.set(work.id, presentEntry(work, { ...presentation, collection: "works" }));
    }
  }
  return works;
}

function previewNote(work, note) {
  return note
    ? { ref: `note:${work}@${note.revision}`, excerpt: note.text.slice(0, noteExcerptLength) }
    : null;
}

function summarizeWorks(works, journals) {
  const summaries = new Map(
    [...works.values()].map(({ id, goal, status, revision, recordedAt }) => [
      id,
      { id, goal, status, revision, recordedAt },
    ]),
  );
  for (const journal of journals) {
    const notes = journal.revisions.filter((note) => !note.forgotten);
    const latest = notes.at(-1);
    const existing = summaries.get(journal.id);
    if (!latest && !existing) continue;
    summaries.set(journal.id, {
      ...(existing ?? {
        id: journal.id,
        goal: null,
        status: null,
        revision: latest.revision,
        recordedAt: latest.recordedAt,
      }),
      latestRecordAt: latest?.recordedAt ?? existing.recordedAt,
      firstNote: previewNote(journal.id, notes[0]),
      latestNote: previewNote(journal.id, latest),
    });
  }
  return [...summaries.values()].sort(
    (left, right) =>
      (right.latestRecordAt ?? right.recordedAt).localeCompare(
        left.latestRecordAt ?? left.recordedAt,
      ) || left.id.localeCompare(right.id),
  );
}

export function buildRecall(archive, history, options) {
  const current = getLatestConsolidation(history);
  const presentation = {
    current,
    history,
    includeHistory: options.history,
    availableRefs: new Set(
      archive.sources.filter(({ forgotten }) => !forgotten).map(({ ref }) => ref),
    ),
  };
  const query = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const memories = restoreMemories(archive, history, presentation)
    .filter((memory) => matchesContextScope(memory, options.work))
    .filter(({ text, reason }) =>
      query.every((word) => `${text}\n${reason}`.toLowerCase().includes(word)),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const works = restoreWorks(archive, presentation);
  const summaries = summarizeWorks(works, archive.journals);
  const pending = findUnprocessedSources(archive, current.cursor).filter(
    (source) =>
      !source.forgotten &&
      matchesContextScope(source, options.work) &&
      (source.kind === "note" || (history && source.latest)),
  );
  const offset = options.offset ?? 0;
  const end = offset + (options.limit ?? 50);
  return {
    memories: memories.slice(offset, end),
    memoriesRemaining: Math.max(0, memories.length - end),
    works: summaries.slice(offset, end),
    worksRemaining: Math.max(0, summaries.length - end),
    work: works.get(options.work) ?? null,
    pending: pending.slice(offset, end),
    pendingRemaining: Math.max(0, pending.length - end),
    graph: queryGraph(current, archive, options),
    tidy: calculateTidyStatus(archive, current),
  };
}

export async function recallContext(location, options) {
  const [archive, history] = await Promise.all([
    readSourceArchive(location),
    readConsolidationHistory(location),
  ]);
  return { ...location, ...buildRecall(archive, history, options) };
}
