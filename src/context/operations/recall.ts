import type { SourceArchive, OriginalSource } from "../sources/model.ts";
import type {
  ConsolidationHistory,
  Consolidation,
  Memory,
  ConsolidatedWork,
} from "../tidy/model.ts";
import type { QueryOptions, Scope, RecordSource, Revision } from "../model.ts";
import type { MemoryContent, Note, WorkJournal } from "../records/model.ts";
import type { WorkProgress, WorkStatus } from "../work/model.ts";
import type { ProjectLocation } from "../storage/store.ts";
type Presentation = {
  current: Consolidation;
  history: ConsolidationHistory | null;
  includeHistory?: boolean;
  availableRefs: Set<string>;
};
type Presented = {
  revision: number;
  recordedAt: string;
  source: RecordSource;
  history?: unknown[];
};
type RecalledMemory = { id: string; scope: Scope; unconsolidated?: boolean } & MemoryContent &
  Presented;
type RecalledWork = Omit<WorkProgress, "status"> &
  Revision & {
    id: string;
    status: WorkStatus;
    checkpointRevision?: number;
    sources?: string[];
    source?: RecordSource;
  };
type WorkSummary = {
  id: string;
  goal: string | null;
  status: WorkStatus | null;
  revision: number;
  recordedAt: string;
  checkpointRevision?: number;
  latestRecordAt?: string;
  firstNote?: ReturnType<typeof previewNote>;
  latestNote?: ReturnType<typeof previewNote>;
};
import { presentLatestRevision } from "../records/records.ts";
import {
  getCursorRevision,
  findUnprocessedSources,
  readSourceArchive,
  matchesContextScope,
} from "../sources/sources.ts";
import { readConsolidationHistory } from "../tidy/tidy.ts";
import { getLatestConsolidation, calculateTidyStatus } from "../tidy/consolidation.ts";
import { queryGraph } from "../graph/query.ts";
import { presentWork } from "../work/work.ts";

const noteExcerptLength = 300;

function presentEntry<T extends Memory | ConsolidatedWork>(
  entry: T,
  {
    current,
    history,
    includeHistory,
    collection,
  }: Presentation & { collection: "memories" | "works" },
): T & Presented {
  const result: T & Presented = {
    ...entry,
    revision: current.revision,
    recordedAt: current.recordedAt!,
    source: {
      type: "agent",
      reference: `tidy revision ${current.revision}; sources: ${entry.sources.join(", ")}`,
    },
  };
  if (includeHistory)
    result.history = history!.revisions.slice(0, -1).flatMap((previous) =>
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

function restoreMemories(
  archive: SourceArchive,
  history: ConsolidationHistory | null,
  presentation: Presentation,
): RecalledMemory[] {
  if (!history)
    return archive.memories
      .filter((memory) => !memory.forgotten)
      .map((memory) => presentLatestRevision(memory, presentation.includeHistory)!);
  const { current, availableRefs } = presentation;
  const memories: RecalledMemory[] = current.memories
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
      memory.revisions.at(-1)!.revision > getCursorRevision(current.cursor, "memory", memory.id)
    ) {
      memories.push({
        ...presentLatestRevision(memory, presentation.includeHistory)!,
        unconsolidated: true,
      });
    }
  }
  return memories;
}

function restoreWorks(archive: SourceArchive, presentation: Presentation) {
  const works = new Map<string, RecalledWork>(
    archive.checkpoints.map((checkpoint) => [
      checkpoint.id,
      {
        ...presentLatestRevision(checkpoint, presentation.includeHistory)!,
        checkpointRevision: checkpoint.revisions.at(-1)!.revision,
      },
    ]),
  );
  for (const work of presentation.current.works) {
    const checkpointRevision = works.get(work.id)?.checkpointRevision ?? 0;
    const acceptedCheckpointRevision =
      work.checkpointRevision ??
      getCursorRevision(presentation.current.cursor, "checkpoint", work.id);
    if (checkpointRevision > acceptedCheckpointRevision) continue;
    if (work.sources.every((ref) => presentation.availableRefs.has(ref))) {
      works.set(work.id, {
        ...presentEntry(work, { ...presentation, collection: "works" }),
        checkpointRevision,
      });
    }
  }
  for (const record of archive.works ?? [])
    works.set(
      record.id,
      presentWork(
        record.revisions.at(-1)!,
        presentation.includeHistory ? record.revisions : undefined,
      ),
    );
  return works;
}

function previewNote(work: string, note: Extract<Note, { text: string }> | undefined) {
  return note
    ? { ref: `note:${work}@${note.revision}`, excerpt: note.text.slice(0, noteExcerptLength) }
    : null;
}

function summarizeWorks(works: Map<string, RecalledWork>, journals: WorkJournal[]) {
  const summaries = new Map<string, WorkSummary>(
    [...works.values()].map(({ id, goal, status, revision, checkpointRevision, recordedAt }) => [
      id,
      { id, goal, status, revision, checkpointRevision, recordedAt },
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
        checkpointRevision: 0,
        revision: latest!.revision,
        recordedAt: latest!.recordedAt,
      }),
      latestRecordAt: latest?.recordedAt ?? existing!.recordedAt,
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

function findUnreviewedWorks(
  summaries: WorkSummary[],
  works: Map<string, RecalledWork>,
  pendingSources: OriginalSource[],
) {
  return summaries.filter((summary) => {
    const state = works.get(summary.id);
    if (!state) return true;
    return pendingSources.some(
      (source) =>
        source.kind === "note" &&
        source.id === summary.id &&
        !state.sources?.includes(source.ref) &&
        !state.evidence.includes(source.ref) &&
        state.source?.reference !== source.ref &&
        (state.sources !== undefined || source.recordedAt > state.recordedAt),
    );
  });
}

export function buildRecall(
  archive: SourceArchive,
  history: ConsolidationHistory | null,
  options: QueryOptions,
) {
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
  const pendingSources = findUnprocessedSources(archive, current.cursor).filter(
    (source) => !source.forgotten,
  );
  const pending = pendingSources.filter(
    (source) =>
      matchesContextScope(source, options.work) &&
      (source.kind === "note" || (history && source.latest)),
  );
  const unfinishedWorks = summaries
    .filter(({ status }) => ["active", "blocked", "paused", "submitted"].includes(status ?? ""))
    .map((summary) => ({ ...works.get(summary.id), ...summary }));
  const unreviewedWorks = findUnreviewedWorks(summaries, works, pendingSources);
  const awaitingReviewWorks = summaries
    .filter(({ status }) => status === "submitted")
    .map((summary) => ({ ...works.get(summary.id), ...summary }));
  const offset = options.offset ?? 0;
  const end = offset + (options.limit ?? 50);
  return {
    memories: memories.slice(offset, end),
    memoriesRemaining: Math.max(0, memories.length - end),
    works: summaries.slice(offset, end),
    worksRemaining: Math.max(0, summaries.length - end),
    unfinishedWorks: unfinishedWorks.slice(offset, end),
    unfinishedWorksRemaining: Math.max(0, unfinishedWorks.length - end),
    unreviewedWorks: unreviewedWorks.slice(offset, end),
    unreviewedWorksRemaining: Math.max(0, unreviewedWorks.length - end),
    awaitingReviewWorks: awaitingReviewWorks.slice(offset, end),
    awaitingReviewWorksRemaining: Math.max(0, awaitingReviewWorks.length - end),
    work: options.work === undefined ? null : (works.get(options.work) ?? null),
    pending: pending.slice(offset, end),
    pendingRemaining: Math.max(0, pending.length - end),
    graph: queryGraph(current, archive, options),
    tidy: calculateTidyStatus(archive, current),
  };
}

export async function recallContext(location: ProjectLocation, options: QueryOptions) {
  const [archive, history] = await Promise.all([
    readSourceArchive(location),
    readConsolidationHistory(location),
  ]);
  return { ...location, ...buildRecall(archive, history, options) };
}
