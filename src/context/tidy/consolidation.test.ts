import type { OriginalSource } from "../sources/model.ts";
import { expect, test } from "vitest";
import { buildConsolidation, parseTidyChanges, calculateTidyStatus } from "./consolidation.ts";

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

test("tidy is due by pending volume or age while processed records do not trigger it", () => {
  const now = Date.UTC(2026, 9, 15, 9);
  const cursor = { memory: {}, checkpoint: {}, note: {} };
  const view = { revision: 0, cursor };
  const fresh = Array.from({ length: 20 }, (_, i) => ({
    kind: "note" as const,
    id: "ongoing",
    revision: i + 1,
    recordedAt: new Date(now - 1000).toISOString(),
  }));
  expect(calculateTidyStatus({ sources: fresh.slice(0, 19) }, view, now).due).toBe(false);
  expect(calculateTidyStatus({ sources: fresh }, view, now).reasons).toStrictEqual([
    "record-count",
  ]);
  const old = { ...fresh[0], recordedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() };
  expect(calculateTidyStatus({ sources: [old] }, view, now).reasons).toStrictEqual(["age"]);
  expect(
    calculateTidyStatus(
      { sources: [old] },
      { revision: 1, cursor: { ...cursor, note: { ongoing: 1 } } },
      now,
    ).due,
  ).toBe(false);
});
