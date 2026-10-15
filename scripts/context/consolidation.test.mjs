import { expect, test } from "vitest";
import { buildConsolidation, getLatestConsolidation, parseTidyChanges } from "./consolidation.mjs";
import { buildRecall } from "./recall.mjs";

const recordedAt = "2026-10-15T12:00:00.000Z";
const cursor = { memory: {}, checkpoint: {}, note: {} };
const note = {
  kind: "note",
  id: "task",
  ref: "note:task@1",
  revision: 1,
  recordedAt,
  scope: { type: "work", id: "task" },
  text: "Keep the existing constraint; this task is unfinished.",
};
const memory = {
  id: "constraint",
  scope: { type: "project" },
  text: "Keep the constraint.",
  reason: "User agreement",
  status: "active",
  sources: [note.ref],
  supersedes: [],
};

function freeze(object) {
  for (const value of Object.values(object)) if (value && typeof value === "object") freeze(value);
  return Object.freeze(object);
}

test("consolidating unfinished work preserves agreements and leaves later arrivals pending", () => {
  const later = { ...note, ref: "note:task@2", revision: 2, text: "A later observation." };
  const archive = freeze({
    memories: [],
    checkpoints: [],
    journals: [{ id: "task", revisions: [note, later] }],
    sources: [note, later],
    bounds: { ...cursor, note: { task: 2 } },
  });
  const history = freeze({
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
  const snapshot = freeze({
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
  expect(recalled.work.status).toBe("active");
  expect(recalled.pending.map(({ ref }) => ref)).toStrictEqual([later.ref]);
  expect(history.revisions.length).toBe(1);
});

test("consolidation rejects a state for work without any source records", () => {
  const archive = { memories: [], checkpoints: [], journals: [], sources: [note], bounds: cursor };
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
        snapshot: { id: "batch", bounds: cursor },
        prepared: [note],
        recordedAt,
      },
      changes,
    ),
  ).toThrowError(/Unknown work: unknown/);
});
