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
import { contextSelection, measureContext } from "./compaction.ts";

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
  for (const kind of ["work", "evidence"] as const) {
    if (cursor[kind] === undefined) continue;
    validateObject(cursor[kind], `cursor.${kind}`);
    for (const [id, revision] of Object.entries(cursor[kind])) {
      parseRecordId(id);
      parseRevisionNumber(revision);
    }
  }
  if (cursor.reviewed !== undefined) validateSourceReferences(cursor.reviewed, "cursor.reviewed");
}

function validateConsolidatedMemoryFields(memory: Memory) {
  validateObject(memory, "memory");
  parseRecordId(memory.id);
  validateMemoryScope(memory.scope);
  validateRequiredSourceReferences(memory.sources, "sources");
  if (memory.supersedes !== undefined) validateSourceReferences(memory.supersedes, "supersedes");
  if (memory.status === "absorbed") {
    validateObject(memory.absorption, "absorption");
    validateMemoryIds(memory.absorption.into, "absorption.into");
    assertCondition(memory.absorption.into.length > 0, "Absorption needs a destination memory");
    validateText(memory.absorption.reason, "absorption.reason");
    return;
  }
  validateText(memory.text, "text");
  validateText(memory.reason, "reason");
}

function validateConsolidatedMemory(memory: Memory) {
  validateConsolidatedMemoryFields(memory);
  validateChoice(memory.status, ["active", "unresolved", "retired", "absorbed"], "status");
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
  assertCondition([1, 2, 3].includes(snapshot.version), "Unsupported tidy snapshot version");
  parseRecordId(snapshot.id);
  parseRevisionNumber(snapshot.baseRevision);
  validateRevisionCursor(snapshot.bounds);
  if (snapshot.version === 2 || snapshot.memoryIds !== undefined)
    validateMemoryIds(snapshot.memoryIds, "memoryIds");
  if (snapshot.version === 3) {
    validateText(snapshot.purpose, "purpose");
    validateText(snapshot.input, "input");
    validateObject(snapshot.memories, "memories");
    validateArray(snapshot.batch, "batch");
    snapshot.batch!.forEach((ref) => validateText(ref, "batch target"));
    assertCondition(
      new Set(snapshot.batch).size === snapshot.batch!.length,
      "Duplicate batch target",
    );
    validateSourceReferences(snapshot.seeds, "seeds");
    validateText(snapshot.basis, "basis");
    validateObject(snapshot.selection, "selection");
  }
  return snapshot;
}

export function parseConsolidationHistory(input: unknown): ConsolidationHistory {
  const history = input as ConsolidationHistory;
  validateObject(history, "history");
  validateArray(history.forgotten, "forgotten");
  assertCondition([1, 2, 3, 4].includes(history.version), "Unsupported tidy store version");
  history.forgotten.forEach((id) => parseRecordId(id));
  validateArray(history.revisions, "revisions");
  if (history.version !== 4 || history.revisions.length > 0)
    validateRecordRevisions(history.revisions, (revision) => {
      if (revision.snapshot !== null) parseRecordId(revision.snapshot);
      validateRevisionCursor(revision.cursor);
      validateArray(revision.memories, "memories");
      validateArray(revision.works, "works");
      revision.memories.forEach(validateConsolidatedMemory);
      revision.works.forEach(validateConsolidatedWorkState);
      if (revision.graph) validateGraph(revision.graph);
    });
  if (history.cursor !== undefined) validateRevisionCursor(history.cursor);
  if (history.receipts !== undefined) {
    validateArray(history.receipts, "receipts");
    for (const receipt of history.receipts) {
      validateObject(receipt, "receipt");
      parseRecordId(receipt.snapshot, "receipt.snapshot");
      parseRecordId(receipt.key, "receipt.key");
      for (const field of ["hash", "purpose", "input", "output", "recordedAt"] as const)
        validateText(receipt[field], `receipt.${field}`);
      for (const field of ["reviewed", "read"] as const) {
        validateArray(receipt[field], `receipt.${field}`);
        receipt[field].forEach((ref) => validateText(ref, `receipt.${field} target`));
      }
      validateObject(receipt.result, "receipt.result");
      validateRevisionCursor(receipt.result.cursor);
      validateArray(receipt.result.memories, "receipt.result.memories");
      receipt.result.memories.forEach(validateConsolidatedMemory);
      validateArray(receipt.result.works, "receipt.result.works");
      receipt.result.works.forEach(validateConsolidatedWorkState);
      if (receipt.result.graph) validateGraph(receipt.result.graph);
    }
    assertCondition(
      new Set(history.receipts.map(({ key }) => key)).size === history.receipts.length,
      "Duplicate tidy request key",
    );
    assertCondition(
      new Set(history.receipts.map(({ snapshot }) => snapshot)).size === history.receipts.length,
      "Duplicate tidy snapshot receipt",
    );
  }
  return history;
}

export function getLatestConsolidation(history: ConsolidationHistory | null): Consolidation {
  const current = history?.revisions.at(-1) ?? {
    revision: 0,
    cursor: createRevisionCursor(),
    memories: [],
    works: [],
  };
  return {
    ...current,
    ...(history?.cursor ? { cursor: history.cursor } : {}),
    ...(history?.receipts?.length ? { reviewedAt: history.receipts.at(-1)!.recordedAt } : {}),
  };
}

export function calculateTidyStatus(
  archive: SourceArchive,
  consolidation: Consolidation,
  nowMs = Date.now(),
  options: { work?: string; query?: string; history?: ConsolidationHistory | null } = {},
) {
  const matchesSelection = contextSelection(options);
  const unprocessedRecords = findUnprocessedSources(archive, consolidation.cursor).filter(
    matchesSelection,
  );
  const memories = collectMemoryBaseline(archive, consolidation);
  const { reasons: contextReasons, ...context } = measureContext(
    memories.filter(matchesSelection),
    unprocessedRecords,
    options.history,
  );
  const oldestPendingAt = unprocessedRecords.reduce(
    (earliest, { recordedAt }) => Math.min(earliest, Date.parse(recordedAt)),
    Infinity,
  );
  const dueReasons = [];
  if (unprocessedRecords.length >= 20) dueReasons.push("record-count");
  if (unprocessedRecords.length && nowMs - oldestPendingAt >= 24 * 60 * 60 * 1000)
    dueReasons.push("age");
  return {
    due: dueReasons.length > 0 || contextReasons.length > 0,
    revision: consolidation.revision,
    pendingRecords: unprocessedRecords.length,
    lastTidiedAt: consolidation.recordedAt ?? null,
    lastReviewedAt: consolidation.reviewedAt ?? null,
    reasons: [...dueReasons, ...contextReasons],
    context,
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
    if (!latestKnownContent) continue;
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
  for (const field of [
    "work",
    "workState",
    "definition",
    "criteria",
    "evidence",
    "corrections",
    "relations",
    "standing",
  ])
    assertCondition(
      !(field in input),
      `Tidy cannot change authoritative ${field}; use its owning command`,
    );
  const changes: TidyChanges = {
    snapshot: input.snapshot,
    memories: input.memories === undefined ? [] : input.memories,
    works: input.works === undefined ? [] : input.works,
    retire: input.retire === undefined ? [] : input.retire,
  };
  if (input.legacy !== undefined) {
    validateChoice(input.legacy, [true, false], "legacy");
    changes.legacy = input.legacy;
  }
  const key = input.key ?? (input as TidyChanges & { requestKey?: string }).requestKey;
  if (key !== undefined) changes.key = parseRecordId(key, "key");
  for (const field of ["reviewed", "read", "gaps"] as const) {
    if (input[field] === undefined) continue;
    validateArray(input[field], field);
    input[field]!.forEach((ref) => validateText(ref, field));
    assertCondition(new Set(input[field]).size === input[field]!.length, `Duplicate ${field}`);
    changes[field] = input[field];
  }
  if (input.reason !== undefined) {
    validateText(input.reason, "reason");
    changes.reason = input.reason;
  }
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
  if (input.absorb !== undefined) {
    validateArray(input.absorb, "absorb");
    changes.absorb = input.absorb.map((absorption) => {
      validateObject(absorption, "absorb entry");
      const { from, into, reason } = absorption;
      validateMemoryIds(from, "absorb.from");
      validateMemoryIds(into, "absorb.into");
      assertCondition(
        from.length > 0 && into.length > 0,
        "Absorption needs source and destination memories",
      );
      validateText(reason, "absorb.reason");
      return { from, into, reason };
    });
  }
  const absorbedIds = (changes.absorb ?? []).flatMap(({ from }) => from);
  const memoryIds = [...changes.memories, ...changes.retire]
    .map(({ id }) => id)
    .concat(absorbedIds);
  assertCondition(
    new Set(memoryIds).size === memoryIds.length,
    "A memory cannot be written, retired or absorbed twice",
  );
  assertCondition(
    (changes.absorb ?? []).every(({ into }) => into.every((id) => !absorbedIds.includes(id))),
    "An absorption destination cannot also be absorbed in the same change",
  );
  const workIds = changes.works.map(({ id }) => id);
  assertCondition(new Set(workIds).size === workIds.length, "A work cannot be written twice");
  return changes;
}

function validateMemoryIds(ids: unknown, label: string): asserts ids is string[] {
  validateArray(ids, label);
  ids.forEach((id) => parseRecordId(id));
  assertCondition(new Set(ids).size === ids.length, `Duplicate ${label}`);
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

export function hashOriginalSource(source: object) {
  const { latest, ...content } = source as { latest?: boolean };
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
    reviewedMemoryIds,
  }: {
    existingMemories: Memory[];
    forgottenMemoryIds: string[];
    memoryRecords: StoredMemory[];
    reviewedMemoryIds: string[];
  },
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
      !existingMemory || !("status" in existingMemory) || existingMemory.status !== "absorbed",
      `Memory ${memory.id} was absorbed; use a new ID`,
    );
    assertCondition(
      !existingMemory || isDeepStrictEqual((existingMemory as Memory).scope, memory.scope),
      "A memory's scope cannot change",
    );
    memoriesById.set(memory.id, memory);
  }
  for (const { id, reason, sources } of changes.retire) {
    const retiredMemory = memoriesById.get(id);
    assertCondition(retiredMemory, `Cannot retire missing memory: ${id}`);
    assertCondition(retiredMemory.status !== "absorbed", `Memory ${id} was already absorbed`);
    memoriesById.set(id, { ...retiredMemory, status: "retired", retirement: { reason, sources } });
  }
  for (const { from, into, reason } of changes.absorb ?? []) {
    for (const id of into)
      assertCondition(
        memoriesById.get(id)?.status === "active",
        `Absorption destination must be an active memory: ${id}`,
      );
    for (const id of from) {
      assertCondition(reviewedMemoryIds.includes(id), `Memory was not selected for review: ${id}`);
      const memory = memoriesById.get(id);
      assertCondition(
        memory && ["active", "unresolved"].includes(memory.status),
        `Cannot absorb missing or inactive memory: ${id}`,
      );
      memoriesById.set(id, {
        id,
        scope: memory.scope,
        status: "absorbed",
        sources: memory.sources,
        supersedes: memory.supersedes ?? [],
        absorption: { into, reason },
      });
    }
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
  const sanitize = <T extends Consolidation>(revision: T): T => {
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
  };
  const sanitizedRevisions = history.revisions.map(sanitize);
  const receipts = history.receipts?.map((receipt) => {
    const result = sanitize(receipt.result);
    const affected =
      receipt.read.some(matchesReference) ||
      receipt.reviewed.some(matchesReference) ||
      (memoryId !== undefined && receipt.reviewed.includes(`current:${memoryId}`)) ||
      !isDeepStrictEqual(result, receipt.result);
    if (!affected) return receipt;
    const { reason, gaps, ...remaining } = receipt;
    return {
      ...remaining,
      forgotten: true,
      read: receipt.read.filter((ref) => !matchesReference(ref)),
      reviewed: receipt.reviewed.filter(
        (ref) => !matchesReference(ref) && ref !== `current:${memoryId}`,
      ),
      result: {
        ...result,
        reviewed: result.reviewed.filter(
          (ref) => !matchesReference(ref) && ref !== `current:${memoryId}`,
        ),
      },
    };
  });
  const forgottenMemoryIds =
    memoryId === undefined ? history.forgotten : [...new Set([...history.forgotten, memoryId])];
  if (
    isDeepStrictEqual(history.revisions, sanitizedRevisions) &&
    isDeepStrictEqual(history.forgotten, forgottenMemoryIds) &&
    isDeepStrictEqual(history.receipts, receipts)
  )
    return history;
  const latestSanitized = sanitizedRevisions.at(-1);
  return {
    ...history,
    forgotten: forgottenMemoryIds,
    ...(receipts ? { receipts } : {}),
    revisions: [
      ...sanitizedRevisions,
      ...(latestSanitized && !isDeepStrictEqual(history.revisions, sanitizedRevisions)
        ? [
            {
              ...latestSanitized,
              revision: consolidation.revision + 1,
              recordedAt: new Date().toISOString(),
              snapshot: null,
              requestHash: null,
            },
          ]
        : []),
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
  const legacy = snapshot.version < 3 || changes.legacy === true;
  assertCondition(
    legacy || (!changes.works.length && !changes.graph && !(changes.absorb ?? []).length),
    "Legacy work, graph and absorption changes require legacy: true",
  );
  for (const work of changes.works) {
    assertCondition(knownWorkIds.has(work.id), `Unknown work: ${work.id}`);
    assertCondition(
      !(archive.works ?? []).some(({ id }) => id === work.id),
      `Managed work ${work.id} must be changed with a work command, not tidy`,
    );
  }
  const baseline = collectMemoryBaseline(archive, current, snapshot.bounds);
  const retiredIds = new Set(changes.retire.map(({ id }) => id));
  const existingMemories = legacy
    ? baseline
    : [
        ...current.memories,
        ...baseline.filter(
          ({ id }) => retiredIds.has(id) && !current.memories.some((memory) => memory.id === id),
        ),
      ];
  const memories = applyMemoryChanges(
    {
      existingMemories,
      forgottenMemoryIds: history?.forgotten ?? [],
      memoryRecords: archive.memories,
      reviewedMemoryIds: snapshot.memoryIds ?? [],
    },
    changes,
  );
  const works = new Map(current.works.map((work) => [work.id, work]));
  const checkpoints = new Map<string, Extract<OriginalSource, { kind: "checkpoint" }>>();
  for (const source of legacy ? prepared : []) {
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
    ...history,
    version:
      snapshot.version === 3 ? 4 : Math.max(history?.version ?? 2, changes.absorb?.length ? 3 : 2),
    forgotten: history?.forgotten ?? [],
    ...(snapshot.version === 3 || history?.cursor ? { cursor: revision.cursor } : {}),
    revisions: [...(history?.revisions ?? []), revision],
  };
}
