import type { Fixture } from "./testing.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, invoke, run } from "./testing.ts";

function record(project: Fixture, work: string, text: string) {
  return run(project, ["record", "--work", work, "--source", "Observed during work"], text);
}

test("an exact source read is independent of unrelated corrupt work", (t) => {
  const project = fixture(t);
  const note = record(project, "healthy", "Verified result.");
  record(project, "unrelated", "Other work.");
  const location = run(project, ["location"]);
  writeFileSync(join(location.projectDirectory, "works/unrelated/notes.json"), "{broken");
  expect(run(project, ["read", "--ref", note.ref]).text).toBe(note.text);
  expect(invoke(project, ["read", "--ref", "note:healthy@2"]).status).toBe(1);
});

test("first recall identifies work from notes before consolidation", (t) => {
  const project = fixture(t);
  const first = record(project, "login", "Fix login session renewal. Reproduction remains.");
  const last = record(project, "login", "Reproduced the race; the correction is next.");
  record(project, "login-ui", "Improve keyboard navigation on the login screen.");
  const recalled = run(project, ["recall"]);
  const login = recalled.works.find(({ id }: { id: string }) => id === "login");
  expect(login.firstNote).toStrictEqual({ ref: first.ref, excerpt: first.text });
  expect(login.latestNote).toStrictEqual({ ref: last.ref, excerpt: last.text });
  expect(login.status).toBe(null);
  expect(recalled.tidy.due).toBe(false);
});

test("recall pages memories, work summaries, and pending notes without dropping entries", (t) => {
  const project = fixture(t);
  const note = record(project, "first", "Shared constraints.");
  record(project, "second", "Another task.");
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: ["alpha", "beta", "gamma"].map((id) => ({
      id,
      scope: { type: "project" },
      text: `Constraint ${id}`,
      reason: "User agreement",
      sources: [note.ref],
    })),
  });
  record(project, "first", "First pending change.");
  record(project, "first", "Second pending change.");
  const first = run(project, ["recall", "--work", "first", "--limit", "1"]);
  const second = run(project, ["recall", "--work", "first", "--limit", "1", "--offset", "1"]);
  expect(first.memories.length).toBe(1);
  expect(first.memoriesRemaining).toBe(2);
  expect(first.works.length).toBe(1);
  expect(first.worksRemaining).toBe(1);
  expect(first.pending.length).toBe(1);
  expect(first.pendingRemaining).toBe(1);
  expect(first.memories[0].id).not.toBe(second.memories[0].id);
  expect(first.works[0].id).not.toBe(second.works[0].id);
  expect(first.pending[0].ref).not.toBe(second.pending[0].ref);
});

test("invalid tidy values leave originals pending and valid retries can proceed", (t) => {
  const project = fixture(t);
  const note = record(project, "review", "Keep this constraint.");
  const batch = run(project, ["tidy", "prepare"]);
  const memory = {
    id: "constraint",
    scope: { type: "project" },
    text: note.text,
    reason: "Agreement",
    sources: [note.ref],
  };
  for (const [overrides, field] of [
    [{ scope: { type: "projects" } }, "scope.type"],
    [{ status: "retired" }, "status"],
    [{ sources: null }, "sources"],
  ] as const) {
    const result = invoke(project, ["tidy", "apply"], {
      snapshot: batch.snapshot,
      memories: [{ ...memory, ...overrides }],
    });
    expect(result.status).toBe(1);
    expect(result.stderr.includes(field), result.stderr).toBeTruthy();
    expect(run(project, ["recall", "--work", "review"]).pending.length).toBe(1);
  }
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot, memories: [memory] });
  expect(run(project, ["recall"]).memories[0].text).toBe(note.text);
  const invalid = invoke(
    project,
    ["record", "--work", "review", "--source", "Observation", "--by", "observer"],
    "Invalid author.",
  );
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toMatch(/source.type/);
});

test("tidy pages existing context and returns only applied changes", (t) => {
  const project = fixture(t);
  const note = record(project, "review", "Three constraints.");
  const initial = run(project, ["tidy", "prepare"]);
  const memories = ["alpha", "beta", "gamma"].map((id) => ({
    id,
    scope: { type: "project" },
    text: id,
    reason: "Agreement",
    sources: [note.ref],
  }));
  run(project, ["tidy", "apply"], { snapshot: initial.snapshot, memories });
  record(project, "review", "Alpha has changed.");
  const first = run(project, ["tidy", "prepare", "--limit", "1"]);
  const second = run(project, ["tidy", "prepare", "--limit", "1", "--offset", "1"]);
  expect(first.current.memories.length).toBe(1);
  expect(first.current.memoriesRemaining).toBe(2);
  expect(second.current.memories[0].id).toBe("beta");
  expect(first.records).toStrictEqual(second.records);
  const applied = run(project, ["tidy", "apply"], {
    snapshot: second.snapshot,
    memories: [{ ...memories[0], text: "Updated alpha" }],
  });
  expect(applied.memories.map(({ id }: { id: string }) => id)).toStrictEqual(["alpha"]);
  expect(run(project, ["recall"]).memories.length).toBe(3);
});
