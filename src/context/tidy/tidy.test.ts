import type { TestContext } from "vitest";
import type { ProjectLocation } from "../storage/store.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { appendWorkNote } from "../records/journal.ts";
import { append, correct } from "../evidence/evidence.ts";
import { checkChanges } from "../evidence/query.ts";
import { findUnprocessedSources, readSourceArchive } from "../sources/sources.ts";
import {
  applyTidyChanges,
  prepareTidyBatch,
  readConsolidationHistory,
  result,
  status,
} from "./tidy.ts";
import { getLatestConsolidation } from "./consolidation.ts";

async function location(t: TestContext): Promise<ProjectLocation> {
  const root = await mkdtemp(join(tmpdir(), "loom-tidy-"));
  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  return {
    dataDirectory: root,
    projectDirectory: join(root, "project"),
    project: { id: "test", kind: "git", commonDirectory: root },
  };
}

function note(location: ProjectLocation, text: string) {
  return appendWorkNote(location, {
    work: "storage",
    text,
    source: { type: "agent", reference: "Observed behavior" },
  });
}

function memory(id: string, ref: string) {
  return {
    id,
    scope: { type: "project" },
    text: "Keep the observed constraint.",
    reason: "Observed behavior remains applicable.",
    sources: [ref],
  };
}

test("query-selected later records leave earlier records pending", async (t) => {
  const project = await location(t);
  const earlier = await note(project, "Keep the first boundary.");
  const later = await note(project, "Review the selected boundary.");
  const batch = await prepareTidyBatch(project, { limit: 10, query: "selected" });
  expect(batch.records.map(({ ref }) => ref)).toStrictEqual([later.ref]);
  await applyTidyChanges(project, { snapshot: batch.snapshot });
  const current = getLatestConsolidation(await readConsolidationHistory(project));
  expect(
    findUnprocessedSources(await readSourceArchive(project), current.cursor).map(({ ref }) => ref),
  ).toStrictEqual([earlier.ref]);
});

test("default review includes current memories and a no-change receipt prevents repeated review", async (t) => {
  const project = await location(t);
  const original = await note(project, "Keep the first boundary.");
  const initial = await prepareTidyBatch(project, { limit: 10 });
  await applyTidyChanges(project, {
    snapshot: initial.snapshot,
    memories: [memory("boundary", original.ref)],
  });
  const batch = await prepareTidyBatch(project, { limit: 10, purpose: "phase transition" });
  expect(batch.snapshot).toBeTypeOf("string");
  expect(batch.current.memories.map(({ id }) => id)).toStrictEqual(["boundary"]);
  const before = getLatestConsolidation(await readConsolidationHistory(project)).revision;
  const reviewed = await applyTidyChanges(project, {
    snapshot: batch.snapshot,
    reason: "The current memory already preserves the applicable boundary.",
  });
  expect(reviewed.effect).toBe("no-change");
  expect(reviewed.revision).toBe(before);
  const repeated = await prepareTidyBatch(project, { limit: 10, purpose: "phase transition" });
  expect(repeated.snapshot).toBe(null);
  expect(repeated.reviewed).toBe(true);
  expect(getLatestConsolidation(await readConsolidationHistory(project)).revision).toBe(before);
});

test("applied snapshots replay their original result after another tidy and reject another payload", async (t) => {
  const project = await location(t);
  const first = await note(project, "First boundary.");
  const batch = await prepareTidyBatch(project, { limit: 10 });
  const input = {
    snapshot: batch.snapshot,
    key: "first-apply",
    memories: [memory("first", first.ref)],
  };
  const applied = await applyTidyChanges(project, input);
  const second = await note(project, "Second boundary.");
  const next = await prepareTidyBatch(project, { limit: 10 });
  await applyTidyChanges(project, {
    snapshot: next.snapshot,
    memories: [memory("second", second.ref)],
  });
  expect(await applyTidyChanges(project, input)).toStrictEqual(applied);
  await expect(applyTidyChanges(project, { ...input, memories: [] })).rejects.toThrow(
    /already.*different|different.*content/i,
  );
});

test("review completion must name the whole batch and every reviewed record must have been read", async (t) => {
  const project = await location(t);
  const first = await note(project, "First boundary.");
  const second = await note(project, "Second boundary.");
  const batch = await prepareTidyBatch(project, { limit: 10 });
  await expect(
    applyTidyChanges(project, {
      snapshot: batch.snapshot,
      reviewed: [first.ref],
      read: [first.ref, second.ref],
    }),
  ).rejects.toThrow(/whole|batch|reviewed/i);
  await expect(
    applyTidyChanges(project, {
      snapshot: batch.snapshot,
      reviewed: [first.ref, second.ref],
      read: [first.ref],
    }),
  ).rejects.toThrow(/read/i);
  expect(findUnprocessedSources(await readSourceArchive(project)).length).toBe(2);
});

const applies = { target: "storage", conditions: ["current checkout"], lifetime: "project" };
function evidence(id: string, text = "Keep this storage boundary.") {
  return {
    requestKey: id,
    id,
    scope: { type: "project" as const },
    text,
    kind: "decision" as const,
    standing: "adopted" as const,
    applies,
    source: { type: "user" as const, reference: "User storage decision" },
    capture: "direct" as const,
  };
}

test("a relevant correction after prepare conflicts while an independent arrival remains pending", async (t) => {
  const project = await location(t);
  const original = await append(project, evidence("boundary"));
  const stale = await prepareTidyBatch(project, { limit: 10 });
  await correct(project, {
    ...evidence("replacement", "The storage boundary has changed."),
    kind: "correction",
    relation: { type: "replaces", target: original.ref, applies },
    basis: (await checkChanges(project, { seeds: [original.ref] })).basis,
  });
  await expect(applyTidyChanges(project, { snapshot: stale.snapshot })).rejects.toMatchObject({
    outcome: "conflict",
  });
  const fresh = await prepareTidyBatch(project, { limit: 10 });
  const independent = await append(project, evidence("other", "Another independent observation."));
  const saved = await applyTidyChanges(project, { snapshot: fresh.snapshot });
  expect(saved.outcome).toBe("applied");
  expect(
    findUnprocessedSources(await readSourceArchive(project), saved.cursor).map(({ ref }) => ref),
  ).toStrictEqual([independent.ref]);
  const following = await prepareTidyBatch(project, { limit: 10 });
  expect(following.records.map(({ ref }) => ref)).toStrictEqual([independent.ref]);
});

test("independent evidence does not invalidate a completed review outside its selected query", async (t) => {
  const project = await location(t);
  const original = await note(project, "Keep the observed boundary.");
  const first = await prepareTidyBatch(project, { limit: 10 });
  await applyTidyChanges(project, {
    snapshot: first.snapshot,
    memories: [memory("boundary", original.ref)],
  });
  const options = { limit: 10, query: "observed", purpose: "phase transition" };
  const batch = await prepareTidyBatch(project, options);
  const saved = await applyTidyChanges(project, {
    snapshot: batch.snapshot,
    key: "review-boundary",
  });
  await append(project, evidence("independent", "Another storage observation."));
  expect((await prepareTidyBatch(project, options)).snapshot).toBe(null);
  expect(await status(project, options)).toMatchObject({
    reviewed: true,
    needed: false,
    pendingRecords: 0,
  });
  expect(await result(project, { key: "review-boundary" })).toStrictEqual(saved);
  expect(await result(project, { snapshot: batch.snapshot! })).toStrictEqual(saved);
});
