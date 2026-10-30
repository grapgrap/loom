import type { Cursor, SourceArchive, OriginalSource } from "../sources/model.ts";
import type {
  Memory,
  ConsolidatedWork,
  TidySnapshot,
  ConsolidationHistory,
  Consolidation,
  TidyChanges,
} from "./model.ts";
import type { Retirement } from "../model.ts";
import type { StoredMemory } from "../records/model.ts";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  parseRecordId,
  parseRevisionNumber,
  validateWorkProgress,
  validateRecordRevisions,
  validateMemoryScope,
  validateText,
  validateObject,
  validateArray,
  validateChoice,
} from "../records/records.ts";
import {
  advanceRevisionCursor,
  getCursorRevision,
  createRevisionCursor,
  findUnprocessedSources,
  requireSourceByReference,
  collectKnownWorkIds,
  validateSourceReferences,
  validateRequiredSourceReferences,
} from "../sources/sources.ts";
import {
  emptyGraph,
  parseGraphChanges,
  validateGraph,
  applyGraphChanges,
  eraseFromGraph,
} from "../graph/graph.ts";
import { createTidyReport, eraseFromTidyReport } from "./report.ts";

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateRevisionCursor(cursor: Cursor) {
  validateObject(cursor, "cursor");
  for (const kind of ["memory", "checkpoint", "note"] as const) {
    validateObject(cursor[kind], `cursor.${kind}`);
    for (const [id, revision] of Object.entries(cursor[kind])) {
      parseRecordId(id);
      parseRevisionNumber(revision);
    }
  }
  if (cursor.work !== undefined) {
    validateObject(cursor.work, "cursor.work");
    for (const [id, revision] of Object.entries(cursor.work)) {
      parseRecordId(id);
      parseRevisionNumber(revision);
    }
  }
}

function validateConsolidatedMemoryFields(memory: Memory) {
  validateObject(memory, "memory");
  parseRecordId(memory.id);
  validateMemoryScope(memory.scope);
  validateText(memory.text, "text");
  validateText(memory.reason, "reason");
  validateRequiredSourceReferences(memory.sources, "sources");
  if (memory.supersedes !== undefined) validateSourceReferences(memory.supersedes, "supersedes");
}

function validateConsolidatedMemory(memory: Memory) {
  validateConsolidatedMemoryFields(memory);
  validateChoice(memory.status, ["active", "unresolved", "retired"], "status");
  if (memory.retirement !== undefined) {
    validateRetirementEvidence(memory.retirement);
  }
}

function validateConsolidatedWorkState(work: ConsolidatedWork) {
  validateObject(work, "work");
  parseRecordId(work.id);
  validateWorkProgress(work, validateSourceReferences);
  validateRequiredSourceReferences(work.sources, "sources");
  if (work.checkpointRevision !== undefined)
    parseRevisionNumber(work.checkpointRevision, "checkpointRevision");
}

function validateRetirementEvidence(retirement: Retirement) {
  validateObject(retirement, "retirement");
  validateText(retirement.reason, "reason");
  validateRequiredSourceReferences(retirement.sources, "sources");
}

function validateMemoryRetirement(retirement: Retirement & { id: string }) {
  validateObject(retirement, "retirement");
  parseRecordId(retirement.id);
  validateRetirementEvidence(retirement);
}

export function parseTidySnapshot(input: unknown): TidySnapshot {
  const snapshot = input as TidySnapshot;
  validateObject(snapshot, "snapshot");
  assertCondition(snapshot.version === 1, "Unsupported tidy snapshot version");
  parseRecordId(snapshot.id);
  parseRevisionNumber(snapshot.baseRevision);
  validateRevisionCursor(snapshot.bounds);
  return snapshot;
}

export function parseConsolidationHistory(input: unknown): ConsolidationHistory {
  const history = input as ConsolidationHistory;
  validateObject(history, "history");
  validateArray(history.forgotten, "forgotten");
  assertCondition([1, 2].includes(history.version), "Unsupported tidy store version");
  history.forgotten.forEach((id) => parseRecordId(id));
  validateRecordRevisions(history.revisions, (revision) => {
    if (revision.snapshot !== null) parseRecordId(revision.snapshot);
    validateRevisionCursor(revision.cursor);
    validateArray(revision.memories, "memories");
    validateArray(revision.works, "works");
    revision.memories.forEach(validateConsolidatedMemory);
    revision.works.forEach(validateConsolidatedWorkState);
    if (revision.graph) validateGraph(revision.graph);
  });
  return history;
}

export function getLatestConsolidation(history: ConsolidationHistory | null): Consolidation {
  return (
    history?.revisions.at(-1) ?? {
      revision: 0,
      cursor: createRevisionCursor(),
      memories: [],
      works: [],
    }
  );
}

export function calculateTidyStatus(
  archive: { sources: Pick<OriginalSource, "kind" | "id" | "revision" | "recordedAt">[] },
  consolidation: Pick<Consolidation, "cursor" | "revision" | "recordedAt">,
  nowMs = Date.now(),
) {
  const unprocessedRecords = findUnprocessedSources(archive, consolidation.cursor);
  const oldestPendingAt = unprocessedRecords.reduce(
    (earliest, { recordedAt }) => Math.min(earliest, Date.parse(recordedAt)),
    Infinity,
  );
  const dueReasons = [];
  if (unprocessedRecords.length >= 20) dueReasons.push("record-count");
  if (unprocessedRecords.length && nowMs - oldestPendingAt >= 24 * 60 * 60 * 1000)
    dueReasons.push("age");
  return {
    due: dueReasons.length > 0,
    revision: consolidation.revision,
    pendingRecords: unprocessedRecords.length,
    lastTidiedAt: consolidation.recordedAt ?? null,
    reasons: dueReasons,
  };
}

export function collectMemoryBaseline(
  archive: SourceArchive,
  consolidation: Consolidation,
  snapshotBounds = archive.bounds,
) {
  const memoriesById = new Map(consolidation.memories.map((memory) => [memory.id, memory]));
  for (const record of archive.memories) {
    if (record.forgotten || memoriesById.has(record.id)) continue;
    const latestKnownRevision = getCursorRevision(snapshotBounds, "memory", record.id);
    const latestKnownContent = record.revisions.findLast(
      ({ revision }) => revision <= latestKnownRevision,
    );
    if (
      !latestKnownContent ||
      latestKnownContent.revision <= getCursorRevision(consolidation.cursor, "memory", record.id)
    )
      continue;
    const { text, reason, revision } = latestKnownContent;
    memoriesById.set(record.id, {
      id: record.id,
      scope: record.scope,
      text,
      reason,
      status: "active",
      sources: [`memory:${record.id}@${revision}`],
      supersedes: [],
    });
  }
  return [...memoriesById.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function parseTidyChanges(value: unknown): TidyChanges {
  const input = value as TidyChanges;
  validateObject(input, "changes");
  parseRecordId(input.snapshot, "snapshot");
  const changes: TidyChanges = {
    snapshot: input.snapshot,
    memories: input.memories === undefined ? [] : input.memories,
    works: input.works === undefined ? [] : input.works,
    retire: input.retire === undefined ? [] : input.retire,
  };
  if (input.graph !== undefined) changes.graph = parseGraphChanges(input.graph);
  for (const field of ["memories", "works", "retire"] as const)
    validateArray(changes[field], field);
  changes.memories = changes.memories.map((input) => {
    validateObject(input, "memory");
    const { id, scope, text, reason, sources, status = "active", supersedes = [] } = input;
    const memory = { id, scope, text, reason, sources, status, supersedes };
    validateConsolidatedMemoryFields(memory);
    validateChoice(status, ["active", "unresolved"], "status");
    return memory;
  });
  changes.works = changes.works.map((input) => {
    validateObject(input, "work");
    const { id, goal, status, progress, evidence, next, sources } = input;
    const work = { id, goal, status, progress, evidence, next, sources };
    validateConsolidatedWorkState(work);
    return work;
  });
  changes.retire = changes.retire.map((input) => {
    validateObject(input, "retirement");
    const { id, reason, sources } = input;
    const retirement = { id, reason, sources };
    validateMemoryRetirement(retirement);
    return retirement;
  });
  const memoryIds = [...changes.memories, ...changes.retire].map(({ id }) => id);
  assertCondition(
    new Set(memoryIds).size === memoryIds.length,
    "A memory cannot be written or retired twice",
  );
  const workIds = changes.works.map(({ id }) => id);
  assertCondition(new Set(workIds).size === workIds.length, "A work cannot be written twice");
  return changes;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, property]) => [name, sortObjectKeys(property)]),
    );
  }
  return value;
}

export function hashOriginalSource(source: { latest?: boolean }) {
  const { latest, ...content } = source;
  return createHash("sha256")
    .update(JSON.stringify(sortObjectKeys(content)))
    .digest("hex");
}

function assertSourceReferencesAvailable(
  archive: SourceArchive,
  snapshot: TidySnapshot,
  entries: { sources: string[]; supersedes?: string[]; evidence?: string[] }[],
) {
  for (const entry of entries) {
    for (const ref of [...entry.sources, ...(entry.supersedes ?? []), ...(entry.evidence ?? [])]) {
      const source = requireSourceByReference(archive, ref);
      assertCondition(
        source.revision <= getCursorRevision(snapshot.bounds, source.kind, source.id),
        `Source reference is newer than the snapshot: ${ref}`,
      );
    }
  }
}

function applyMemoryChanges(
  {
    existingMemories,
    forgottenMemoryIds,
    memoryRecords,
  }: { existingMemories: Memory[]; forgottenMemoryIds: string[]; memoryRecords: StoredMemory[] },
  changes: TidyChanges,
) {
  const memoriesById = new Map(existingMemories.map((memory) => [memory.id, memory]));
  for (const memory of changes.memories) {
    assertCondition(
      !forgottenMemoryIds.includes(memory.id),
      `Memory ${memory.id} was forgotten; use a new ID`,
    );
    const originalRecord = memoryRecords.find(({ id }) => id === memory.id);
    assertCondition(!originalRecord?.forgotten, `Memory ${memory.id} was forgotten; use a new ID`);
    const existingMemory = memoriesById.get(memory.id) ?? originalRecord;
    assertCondition(
      !existingMemory || isDeepStrictEqual((existingMemory as Memory).scope, memory.scope),
      "A memory's scope cannot change",
    );
    memoriesById.set(memory.id, memory);
  }
  for (const { id, reason, sources } of changes.retire) {
    const retiredMemory = memoriesById.get(id);
    assertCondition(retiredMemory, `Cannot retire missing memory: ${id}`);
    memoriesById.set(id, { ...retiredMemory, status: "retired", retirement: { reason, sources } });
  }
  return [...memoriesById.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function pruneMemoryAfterErasure(
  memory: Memory,
  erasure: { memoryId?: string; matchesReference: (ref: string) => boolean },
) {
  if (
    memory.id === erasure.memoryId ||
    [...memory.sources, ...(memory.retirement?.sources ?? [])].some(erasure.matchesReference)
  )
    return null;
  return {
    ...memory,
    supersedes: (memory.supersedes ?? []).filter((ref) => !erasure.matchesReference(ref)),
  };
}

export function eraseFromConsolidationHistory(
  history: ConsolidationHistory | null,
  {
    memoryId,
    sourceRef: erasedSourceRef,
    expectedRevision,
  }: { memoryId?: string; sourceRef?: string; expectedRevision?: number },
) {
  if (!history) {
    assertCondition(expectedRevision === undefined, `Memory does not exist: ${memoryId}`);
    return null;
  }
  const consolidation = getLatestConsolidation(history);
  if (expectedRevision !== undefined) {
    assertCondition(
      consolidation.revision === expectedRevision || history.forgotten.includes(memoryId!),
      `Tidy revision conflict: current revision is ${consolidation.revision}`,
    );
    assertCondition(
      consolidation.memories.some((memory) => memory.id === memoryId) ||
        history.forgotten.includes(memoryId!),
      `Memory does not exist: ${memoryId}`,
    );
  }
  const matchesReference =
    memoryId === undefined
      ? (ref: string) => ref === erasedSourceRef
      : (ref: string) => ref.startsWith(`memory:${memoryId}@`);
  const sanitizedRevisions = history.revisions.map((revision) => {
    const sanitized = {
      ...revision,
      memories: revision.memories
        .map((memory) => pruneMemoryAfterErasure(memory, { memoryId, matchesReference }))
        .filter((memory) => memory !== null),
      works: revision.works.filter(
        (work) => ![...work.sources, ...work.evidence].some(matchesReference),
      ),
    };
    if (revision.graph) sanitized.graph = eraseFromGraph(revision.graph, matchesReference);
    if (revision.report)
      sanitized.report = eraseFromTidyReport(
        revision.report,
        sanitized,
        matchesReference,
        memoryId,
      );
    return sanitized;
  });
  const forgottenMemoryIds =
    memoryId === undefined ? history.forgotten : [...new Set([...history.forgotten, memoryId])];
  if (
    isDeepStrictEqual(history.revisions, sanitizedRevisions) &&
    isDeepStrictEqual(history.forgotten, forgottenMemoryIds)
  )
    return history;
  const latestSanitized = sanitizedRevisions.at(-1)!;
  return {
    version: history.version,
    forgotten: forgottenMemoryIds,
    revisions: [
      ...sanitizedRevisions,
      {
        ...latestSanitized,
        revision: consolidation.revision + 1,
        recordedAt: new Date().toISOString(),
        snapshot: null,
        requestHash: null,
      },
    ],
  };
}

export function hashChanges(changes: TidyChanges) {
  return createHash("sha256")
    .update(JSON.stringify(sortObjectKeys(changes)))
    .digest("hex");
}

export function validatePreparedSources(
  archive: SourceArchive,
  snapshot: TidySnapshot,
  changes: TidyChanges,
) {
  validateObject(snapshot.hashes, "snapshot.hashes");
  const prepared = Object.entries(snapshot.hashes).map(([ref, hash]) => {
    const source = requireSourceByReference(archive, ref);
    assertCondition(
      hash === hashOriginalSource(source),
      `Snapshot source changed or was forgotten: ${ref}`,
    );
    return source;
  });
  assertSourceReferencesAvailable(archive, snapshot, [
    ...changes.memories,
    ...changes.works,
    ...changes.retire,
    ...[
      ...(changes.graph?.entities ?? []),
      ...(changes.graph?.statements ?? []),
      ...(changes.graph?.retire ?? []),
    ].map(({ sources }) => ({ sources })),
  ]);
  return prepared;
}

export function assertTidyRevision(current: Consolidation, snapshot: TidySnapshot) {
  assertCondition(
    current.revision === snapshot.baseRevision,
    `Tidy revision conflict: current revision is ${current.revision}; prepare a new snapshot and reconsider the changes`,
  );
}

export function buildConsolidation(
  {
    history,
    archive,
    snapshot,
    prepared,
    recordedAt,
  }: {
    history: ConsolidationHistory | null;
    archive: SourceArchive;
    snapshot: TidySnapshot;
    prepared: OriginalSource[];
    recordedAt: string;
  },
  changes: TidyChanges,
): ConsolidationHistory {
  const current = getLatestConsolidation(history);
  const knownWorkIds = collectKnownWorkIds(archive);
  for (const work of changes.works) {
    assertCondition(knownWorkIds.has(work.id), `Unknown work: ${work.id}`);
    assertCondition(
      !(archive.works ?? []).some(({ id }) => id === work.id),
      `Managed work ${work.id} must be changed with a work command, not tidy`,
    );
  }
  const existingMemories = collectMemoryBaseline(archive, current, snapshot.bounds);
  const memories = applyMemoryChanges(
    {
      existingMemories,
      forgottenMemoryIds: history?.forgotten ?? [],
      memoryRecords: archive.memories,
    },
    changes,
  );
  const works = new Map(current.works.map((work) => [work.id, work]));
  const checkpoints = new Map<string, Extract<OriginalSource, { kind: "checkpoint" }>>();
  for (const source of prepared) {
    if (source.kind !== "checkpoint" || source.forgotten) continue;
    const acceptedRevision = Math.max(
      getCursorRevision(current.cursor, "checkpoint", source.id),
      works.get(source.id)?.checkpointRevision ?? 0,
    );
    if (source.revision <= acceptedRevision) continue;
    if (source.revision > (checkpoints.get(source.id)?.revision ?? 0))
      checkpoints.set(source.id, source);
  }
  for (const source of checkpoints.values()) {
    works.set(source.id, {
      id: source.id,
      goal: source.goal,
      status: source.status,
      progress: source.progress,
      evidence: source.evidence.length ? [source.ref] : [],
      next: source.next,
      sources: [source.ref],
      checkpointRevision: source.revision,
    });
  }
  for (const work of changes.works)
    works.set(work.id, {
      ...work,
      checkpointRevision: getCursorRevision(snapshot.bounds, "checkpoint", work.id),
    });
  const graph = applyGraphChanges(
    current.graph ?? emptyGraph(),
    changes.graph ?? parseGraphChanges(),
    knownWorkIds,
  );
  const revision: Consolidation = {
    revision: current.revision + 1,
    recordedAt,
    snapshot: snapshot.id,
    requestHash: hashChanges(changes),
    cursor: advanceRevisionCursor(current.cursor, prepared),
    memories,
    works: [...works.values()].sort((left, right) => left.id.localeCompare(right.id)),
    graph,
  };
  revision.report = createTidyReport(
    { memories: existingMemories, works: current.works, graph: current.graph ?? emptyGraph() },
    revision,
    prepared.map(({ ref }) => ref),
    findUnprocessedSources(archive, revision.cursor).length,
  );
  return {
    version: 2,
    forgotten: history?.forgotten ?? [],
    revisions: [...(history?.revisions ?? []), revision],
  };
}
