import type {
  OriginalSource,
  Memory,
  SourceArchive,
  ConsolidationHistory,
  TidySnapshot,
} from "./model.ts";
import { expect, test } from "vitest";
import { buildConsolidation, getLatestConsolidation, parseTidyChanges } from "./consolidation.ts";
import { buildRecall } from "./recall.ts";

const recordedAt = "2026-10-15T12:00:00.000Z";
const cursor = { memory: {}, checkpoint: {}, note: {} };
const note: Extract<OriginalSource, { kind: "note" }> = {
  requestKey: "test",
  source: { type: "agent", reference: "Test observation" },
  kind: "note",
  id: "task",
  ref: "note:task@1",
  revision: 1,
  recordedAt,
  scope: { type: "work", id: "task" },
  text: "Keep the existing constraint; this task is unfinished.",
};
const memory: Memory = {
  id: "constraint",
  scope: { type: "project" },
  text: "Keep the constraint.",
  reason: "User agreement",
  status: "active",
  sources: [note.ref],
  supersedes: [],
};

function freeze<T extends object>(object: T): T {
  for (const value of Object.values(object)) if (value && typeof value === "object") freeze(value);
  return Object.freeze(object);
}

test("consolidating unfinished work preserves agreements and leaves later arrivals pending", () => {
  const later = { ...note, ref: "note:task@2", revision: 2, text: "A later observation." };
  const archive = freeze<SourceArchive>({
    works: [],
    memories: [],
    checkpoints: [],
    journals: [{ version: 1, id: "task", revisions: [note, later] }],
    sources: [note, later],
    bounds: { ...cursor, note: { task: 2 } },
  });
  const history = freeze<ConsolidationHistory>({
    version: 1,
    forgotten: [],
    revisions: [
      {
        revision: 1,
        recordedAt,
        cursor,
        memories: [memory],
        works: [],
        snapshot: null,
        requestHash: null,
      },
    ],
  });
  const snapshot = freeze<TidySnapshot>({
    version: 1,
    hashes: {},
    id: "batch",
    baseRevision: 1,
    bounds: { ...cursor, note: { task: 1 } },
  });
  const changes = freeze(
    parseTidyChanges({
      snapshot: snapshot.id,
      works: [
        {
          id: "task",
          goal: "Verify the change.",
          status: "active",
          progress: "An observation is recorded.",
          evidence: [],
          next: ["Run verification."],
          sources: [note.ref],
        },
      ],
    }),
  );
  const updated = buildConsolidation(
    { history, archive, snapshot, prepared: [note], recordedAt },
    changes,
  );
  expect(getLatestConsolidation(updated).memories).toStrictEqual([memory]);
  expect(getLatestConsolidation(updated).cursor.note).toStrictEqual({ task: 1 });
  const recalled = buildRecall(archive, updated, { work: "task", limit: 50 });
  expect(recalled.work!.status).toBe("active");
  expect(recalled.pending.map(({ ref }: { ref: string }) => ref)).toStrictEqual([later.ref]);
  expect(history.revisions.length).toBe(1);
});

test("consolidation rejects a state for work without any source records", () => {
  const archive = {
    works: [],
    memories: [],
    checkpoints: [],
    journals: [],
    sources: [note],
    bounds: cursor,
  };
  const changes = parseTidyChanges({
    snapshot: "batch",
    works: [
      {
        id: "unknown",
        goal: "Invented work.",
        status: "active",
        progress: "No task was recorded.",
        evidence: [],
        next: [],
        sources: [note.ref],
      },
    ],
  });
  expect(() =>
    buildConsolidation(
      {
        history: null,
        archive,
        snapshot: { version: 1, id: "batch", baseRevision: 0, hashes: {}, bounds: cursor },
        prepared: [note],
        recordedAt,
      },
      changes,
    ),
  ).toThrowError(/Unknown work: unknown/);
});
