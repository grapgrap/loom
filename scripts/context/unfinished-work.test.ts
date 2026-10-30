import type { WorkProgress } from "./model.ts";
import type { Fixture } from "./testing.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, invoke, run } from "./testing.ts";

function checkpoint(project: Fixture, work: string, overrides = {}) {
  return run(project, ["checkpoint", "--work", work], {
    expectedRevision: 0,
    goal: `Deliver ${work}.`,
    status: "active",
    progress: "The request is accepted; implementation remains.",
    evidence: [],
    next: ["Implement the requested behavior."],
    source: { type: "agent", reference: "User request and observed workspace." },
    ...overrides,
  });
}

function consolidate(project: Fixture, state: WorkProgress & { id: string; revision: number }) {
  const ref = `checkpoint:${state.id}@${state.revision}`;
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    works: [
      {
        id: state.id,
        goal: state.goal,
        status: state.status,
        progress: state.progress,
        evidence: state.evidence.length ? [ref] : [],
        next: state.next,
        sources: [ref],
      },
    ],
  });
}

test("a completed README interruption leaves the original outcome and next action visible", (t) => {
  const project = fixture(t);
  const original = checkpoint(project, "long-feature", {
    goal: "Implement the feature and verify its use.",
    progress: "The API is verified; storage is unfinished.",
    next: ["Implement storage, then verify the feature."],
  });
  const readme = join(project.repo, "README.md");
  writeFileSync(readme, "Feauture documentation.\n");
  checkpoint(project, "readme-typo", { next: ["Correct the README typo."] });
  writeFileSync(readme, "Feature documentation.\n");
  checkpoint(project, "readme-typo", {
    expectedRevision: 1,
    status: "complete",
    progress: "The README typo is corrected and checked.",
    evidence: [readme],
    next: [],
  });

  const recalled = run(project, ["recall", "--work", "readme-typo", "--limit", "1"]);
  expect(recalled.unfinishedWorks.map(({ id }: { id: string }) => id)).toStrictEqual([original.id]);
  expect(recalled.unfinishedWorks[0]).toMatchObject({
    goal: original.goal,
    progress: original.progress,
    next: original.next,
    checkpointRevision: 1,
  });
  expect(readFileSync(readme, "utf8")).toBe("Feature documentation.\n");

  const resuming = recalled.unfinishedWorks[0];
  checkpoint(project, resuming.id, {
    expectedRevision: resuming.checkpointRevision,
    goal: resuming.goal,
    progress: "Returned from the README correction to storage implementation.",
    next: resuming.next,
  });
  expect(run(project, ["recall", "--work", original.id]).work.progress).toContain("Returned");
});

test("reopening completed work is visible before the new checkpoint is consolidated", (t) => {
  const project = fixture(t);
  const completed = checkpoint(project, "feature", {
    status: "complete",
    progress: "The previous delivery was verified.",
    evidence: ["Observed feature verification."],
    next: [],
  });
  consolidate(project, completed);
  checkpoint(project, "feature", {
    expectedRevision: 1,
    progress: "The user requested an additional behavior.",
    next: ["Implement the additional behavior."],
  });

  const recalled = run(project, ["recall", "--work", "feature"]);
  expect(recalled.work.status).toBe("active");
  expect(recalled.work.checkpointRevision).toBe(2);
  expect(recalled.unfinishedWorks[0].next).toStrictEqual(["Implement the additional behavior."]);
});

test("a new completion immediately removes work from the unfinished list", (t) => {
  const project = fixture(t);
  consolidate(project, checkpoint(project, "feature"));
  checkpoint(project, "feature", {
    expectedRevision: 1,
    status: "complete",
    progress: "The requested behavior is verified.",
    evidence: ["Verification passed."],
    next: [],
  });
  const recalled = run(project, ["recall", "--work", "feature"]);
  expect(recalled.work.status).toBe("complete");
  expect(recalled.unfinishedWorks).toStrictEqual([]);
});

test("reviewing checkpoint originals without rewriting work does not restore an older state", (t) => {
  const project = fixture(t);
  consolidate(project, checkpoint(project, "feature"));
  checkpoint(project, "feature", {
    expectedRevision: 1,
    status: "complete",
    progress: "The requested behavior is verified.",
    evidence: ["Verification passed."],
    next: [],
  });
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  const recalled = run(project, ["recall", "--work", "feature"]);
  expect(recalled.work.status).toBe("complete");
  expect(recalled.work.checkpointRevision).toBe(2);
  expect(recalled.unfinishedWorks).toStrictEqual([]);
});

test("a later explicit decision is not reversed when an older checkpoint is processed afterward", (t) => {
  const project = fixture(t);
  checkpoint(project, "feature");
  run(project, ["remember", "--id", "constraint"], {
    expectedRevision: 0,
    scope: { type: "project" },
    text: "Retain the existing behavior.",
    reason: "User agreement.",
    source: { type: "user", reference: "Original request." },
  });
  const verified = run(
    project,
    ["record", "--work", "feature", "--source", "Verified final behavior"],
    "The original feature is implemented and verified.",
  );
  const batch = run(project, ["tidy", "prepare", "--limit", "1"]);
  expect(batch.records[0].kind).toBe("memory");
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    works: [
      {
        id: "feature",
        goal: "Deliver feature.",
        status: "complete",
        progress: verified.text,
        evidence: [verified.ref],
        next: [],
        sources: [verified.ref],
      },
    ],
  });
  const recalled = run(project, ["recall", "--work", "feature"]);
  expect(recalled.work.status).toBe("complete");
  expect(recalled.unreviewedWorks).toStrictEqual([]);
  const remaining = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: remaining.snapshot });
  expect(run(project, ["recall", "--work", "feature"]).work.status).toBe("complete");
});

test("paused and blocked work retain their next steps while cancelled work stays closed", (t) => {
  const project = fixture(t);
  for (const status of ["paused", "blocked", "cancelled"]) {
    const state = checkpoint(project, status, {
      status,
      progress: `${status}: the execution condition is recorded.`,
      next: status === "cancelled" ? [] : ["Resume only when the recorded condition is satisfied."],
    });
    consolidate(project, state);
  }
  const recalled = run(project, ["recall"]);
  expect(
    recalled.unfinishedWorks.map(({ status }: { status: string }) => status).sort(),
  ).toStrictEqual(["blocked", "paused"]);
  expect(recalled.works.find(({ id }: { id: string }) => id === "cancelled").status).toBe(
    "cancelled",
  );
  expect(recalled.unreviewedWorks).toStrictEqual([]);
});

test("uncategorized work and later notes on closed work require review instead of blind resumption", (t) => {
  const project = fixture(t);
  const completed = checkpoint(project, "closed", {
    status: "complete",
    progress: "The original request is complete.",
    evidence: ["Verified original result."],
    next: [],
  });
  consolidate(project, completed);
  const note = run(
    project,
    ["record", "--work", "closed", "--source", "A later user request"],
    "The user added another requirement; review whether this reopens the work.",
  );
  run(
    project,
    ["record", "--work", "unclassified", "--source", "A request not yet classified"],
    "Determine the original goal and remaining work.",
  );
  const recalled = run(project, ["recall"]);
  expect(recalled.unfinishedWorks).toStrictEqual([]);
  expect(recalled.unreviewedWorks.map(({ id }: { id: string }) => id).sort()).toStrictEqual([
    "closed",
    "unclassified",
  ]);
  expect(
    recalled.unreviewedWorks.find(({ id }: { id: string }) => id === "closed").latestNote.ref,
  ).toBe(note.ref);
});

test("unfinished work has its own pagination and is not hidden by recent completed work", (t) => {
  const project = fixture(t);
  checkpoint(project, "older-first");
  checkpoint(project, "older-second");
  checkpoint(project, "recent-completed", {
    status: "complete",
    progress: "A newer, independent request is finished.",
    evidence: ["Verified independently."],
    next: [],
  });
  const first = run(project, ["recall", "--work", "recent-completed", "--limit", "1"]);
  const second = run(project, ["recall", "--limit", "1", "--offset", "1"]);
  expect(first.works[0].id).toBe("recent-completed");
  expect(first.unfinishedWorks).toHaveLength(1);
  expect(first.unfinishedWorksRemaining).toBe(1);
  expect(
    new Set(
      [...first.unfinishedWorks, ...second.unfinishedWorks].map(({ id }: { id: string }) => id),
    ),
  ).toEqual(new Set(["older-first", "older-second"]));
});

test("waiting states need a next step and cancellation cannot retain scheduled actions", (t) => {
  const project = fixture(t);
  for (const status of ["paused", "blocked", "cancelled"]) {
    const result = invoke(project, ["checkpoint", "--work", status], {
      expectedRevision: 0,
      goal: "Preserve the user request.",
      status,
      progress: "The reason is recorded.",
      evidence: [],
      next: status === "cancelled" ? ["Run despite cancellation."] : [],
      source: { type: "user", reference: "Actual user instruction or observed blocker." },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/next|remaining/i);
  }
});
