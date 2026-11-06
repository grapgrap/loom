import type { OriginalSource, SourceArchive } from "../context/sources/model.ts";
import type { Fixture } from "./testing.ts";
import { expect, test } from "vitest";
import { calculateTidyStatus } from "../context/tidy/consolidation.ts";
import { fixture, run } from "./testing.ts";

function saveMemory(project: Fixture, text: string, sources: string[], id = "current-context") {
  const batch = run(project, ["tidy", "prepare", "--work", "storage"]);
  return run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [
      {
        id,
        scope: { type: "work", id: "storage" },
        text,
        reason: "Preserve the agreement and the unresolved next step.",
        sources,
      },
    ],
  });
}

function record(project: Fixture, work: string, text: string) {
  return run(project, ["record", "--work", work, "--source", "Observed conversation"], text);
}

test("prepare reconsiders existing context with no pending records and preserves searchable originals", (t) => {
  const project = fixture(t);
  const original = record(
    project,
    "storage",
    "Commit must persist. Retry policy remains undecided.",
  );
  saveMemory(project, original.text.repeat(100), [original.ref]);
  const batch = run(project, ["tidy", "prepare", "--work", "storage"]);
  expect(batch.records).toStrictEqual([]);
  expect(batch.snapshot).not.toBeNull();
  expect(batch.current.memories[0].text).toContain("Retry policy remains undecided.");
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [{ ...batch.current.memories[0], text: original.text }],
  });
  expect(run(project, ["recall", "--work", "storage"]).memories[0].text).toBe(original.text);
  expect(run(project, ["read", "--ref", original.ref]).text).toBe(original.text);
  expect(run(project, ["search", "--query", "Retry policy"]).results[0].ref).toBe(original.ref);
});

test("unrelated old pending work does not trigger scoped compaction", () => {
  const old: OriginalSource = {
    ref: "note:other@1",
    requestKey: "old-note",
    source: { type: "agent", reference: "Old record" },
    kind: "note",
    id: "other",
    revision: 1,
    scope: { type: "work", id: "other" },
    recordedAt: "2026-01-01T00:00:00Z",
    text: "An old unrelated record.",
  };
  const archive: SourceArchive = {
    checkpoints: [],
    journals: [],
    works: [],
    sources: [old],
    memories: [],
    bounds: { memory: {}, note: { other: 1 }, checkpoint: {} },
  };
  const current = {
    works: [],
    revision: 0,
    cursor: { memory: {}, note: {}, checkpoint: {} },
    memories: [],
  };
  const now = Date.parse("2026-01-03T00:00:00Z");
  expect(calculateTidyStatus(archive, current, now).due).toBe(true);
  expect(calculateTidyStatus(archive, current, now, { work: "storage" })).toMatchObject({
    due: false,
    pendingRecords: 0,
  });
});

test("processed context growth still triggers compaction and a shorter rewrite resets growth", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "Accepted storage contract; retry remains open.");
  saveMemory(project, note.text, [note.ref]);
  saveMemory(project, note.text + " More historical detail.".repeat(500), [note.ref]);
  const grown = run(project, ["tidy", "status", "--work", "storage"]);
  expect(grown.pendingRecords).toBe(0);
  expect(grown.reasons).toContain("context-growth");
  expect(grown.context.growthBytes).toBeGreaterThan(8000);
  expect(run(project, ["tidy", "status", "--work", "other"]).due).toBe(false);
  saveMemory(project, note.text, [note.ref]);
  const compacted = run(project, ["tidy", "status", "--work", "storage"]);
  expect(compacted.due).toBe(false);
  expect(compacted.context.growthBytes).toBe(0);
});

test("apply acknowledges changes once and full retry exposes the unchanged detailed report", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "Keep the agreed persistence boundary.");
  const batch = run(project, ["tidy", "prepare"]);
  const input = {
    snapshot: batch.snapshot,
    memories: [
      {
        id: "boundary",
        scope: { type: "project" },
        text: note.text,
        reason: "Accepted agreement.",
        sources: [note.ref],
      },
    ],
  };
  const compact = run(project, ["tidy", "apply"], input);
  expect(compact).not.toHaveProperty("memories");
  expect(compact).not.toHaveProperty("cursor");
  expect(compact).not.toHaveProperty("graph");
  expect(compact.report.changes).toStrictEqual([
    { kind: "memory", id: "boundary", action: "added" },
  ]);
  const full = run(project, ["tidy", "apply", "--full"], input);
  expect(full.revision).toBe(compact.revision);
  expect(full.report.changes[0].after.text).toBe(note.text);
});

test("scoped recall excludes unrelated work bodies while discovery stays available", (t) => {
  const project = fixture(t);
  for (const work of ["storage", "other"]) {
    run(project, ["work", "create", "--work", work], {
      expectedRevision: 0,
      actor: "main",
      source: { type: "user", reference: "Task request" },
      goal: `Implement ${work}`,
      scope: "Local change.",
      criteria: [{ id: "result", description: "Change works.", verification: "Run it." }],
    });
  }
  const scoped = run(project, ["recall", "--work", "storage"]);
  expect(scoped.unfinishedWorks.map(({ id }: { id: string }) => id)).toStrictEqual(["storage"]);
  expect(scoped.unfinishedWorks[0]).not.toHaveProperty("criteria");
  const discovery = run(project, ["recall"]);
  expect(discovery.unfinishedWorks).toHaveLength(2);
  expect(
    discovery.unfinishedWorks.every((work: { id: string }) => !Object.hasOwn(work, "checks")),
  ).toBe(true);
  const full = run(project, ["recall", "--work", "storage", "--full"]);
  expect(full.unfinishedWorks).toHaveLength(2);
  expect(full.unfinishedWorks[0]).toHaveProperty("criteria");
  const prepared = run(project, ["tidy", "prepare", "--work", "storage"]);
  expect(prepared.current.managedWorks.map(({ id }: { id: string }) => id)).toStrictEqual([
    "storage",
  ]);
  expect(prepared.current).not.toHaveProperty("graph");
});

test("large context without pending records requests review, but an unchanged reduction does not loop", (t) => {
  const project = fixture(t);
  const source = record(project, "storage", "Keep user constraints and the open retry policy.");
  saveMemory(project, "기록된 조건과 미해결 질문. ".repeat(1200), [source.ref]);
  const large = run(project, ["tidy", "status", "--work", "storage"]);
  expect(large.pendingRecords).toBe(0);
  expect(large.reasons).toContain("context-size");
  saveMemory(project, "유효한 조건과 미해결 질문. ".repeat(800), [source.ref]);
  const reduced = run(project, ["tidy", "status", "--work", "storage"]);
  expect(reduced.context.totalBytes).toBeGreaterThan(24000);
  expect(reduced.due).toBe(false);
  expect(run(project, ["recall", "--work", "storage"]).tidy).toStrictEqual(reduced);
});

test("topic selection excludes unrelated pending records from preparation and size signals", (t) => {
  const project = fixture(t);
  const selected = record(project, "storage", "Persistence contract remains unresolved.");
  record(project, "storage", "Unrelated output detail. ".repeat(1500));
  const args = ["--work", "storage", "--query", "Persistence"];
  const batch = run(project, ["tidy", "prepare", ...args]);
  expect(batch.records.map(({ ref }: { ref: string }) => ref)).toStrictEqual([selected.ref]);
  const status = run(project, ["tidy", "status", ...args]);
  expect(status.pendingRecords).toBe(1);
  expect(status.due).toBe(false);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  expect(run(project, ["tidy", "status", "--work", "storage"]).reasons).toContain("context-size");
});

test("an earlier reduction does not hide a new large memory in the same scope", (t) => {
  const project = fixture(t);
  const source = record(project, "storage", "Accepted constraint; next decision remains open.");
  saveMemory(project, source.text.repeat(20), [source.ref], "old-context");
  saveMemory(project, source.text, [source.ref], "old-context");
  saveMemory(project, source.text.repeat(600), [source.ref], "new-context");
  const status = run(project, ["tidy", "status", "--work", "storage"]);
  expect(status.pendingRecords).toBe(0);
  expect(status.reasons).toContain("context-size");
  saveMemory(project, source.text, [source.ref], "new-context");
  expect(run(project, ["tidy", "status", "--work", "storage"]).due).toBe(false);
});
