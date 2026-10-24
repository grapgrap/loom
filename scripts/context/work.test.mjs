import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { fixture, invoke, run, concurrentRequest } from "./testing.mjs";

const source = { type: "agent", reference: "User request and observed test artifacts" };
const criterion = {
  id: "c1",
  description: "The requested behavior works",
  verification: "Observe the public use path",
};

function create(project, id, definition = {}) {
  return run(project, ["work", "create", "--work", id], {
    expectedRevision: 0,
    actor: "main",
    source,
    goal: `Deliver ${id}`,
    scope: "Implement and verify the assigned scope",
    criteria: [criterion],
    ...definition,
  });
}

function show(project, id, ...options) {
  return run(project, ["work", "show", "--work", id, ...options]);
}

function inputFor(project, id, input = {}) {
  return { expectedRevision: show(project, id).work.revision, actor: "main", source, ...input };
}

function change(project, action, id, input = {}) {
  return run(project, ["work", action, "--work", id], inputFor(project, id, input));
}

function report(project, id, input = {}) {
  return change(project, "report", id, {
    progress: "Observed the requested behavior",
    next: [],
    checks: [
      {
        criterionId: "c1",
        verdict: "met",
        observation: "The public path returned the expected result",
        evidence: ["test artifact: verified output"],
      },
    ],
    ...input,
  });
}

test("a standalone work completes only after every agreed criterion has current evidence", (t) => {
  const project = fixture(t);
  create(project, "solo");
  const missing = invoke(
    project,
    ["work", "complete", "--work", "solo"],
    inputFor(project, "solo"),
  );
  expect(missing.status).toBe(1);
  expect(missing.stderr).toMatch(/criterion|criteria/i);
  const observed = report(project, "solo");
  expect(observed.status).toBe("active");
  const completed = change(project, "complete", "solo");
  expect(completed.status).toBe("complete");
  const recalled = run(project, ["recall", "--work", "solo"]);
  expect(recalled.work).toMatchObject({ id: "solo", status: "complete", managed: true });
  expect(recalled.unfinishedWorks).toStrictEqual([]);
  expect(run(project, ["read", "--ref", observed.ref])).toMatchObject({
    id: "solo",
    action: "report",
  });
  expect(run(project, ["read", "--ref", observed.ref]).scope).toStrictEqual({
    type: "work",
    id: "solo",
  });
  expect(
    run(project, ["search", "--query", "solo"]).results.some(({ ref }) =>
      ref.startsWith("work:solo@"),
    ),
  ).toBe(true);
  expect(
    run(project, ["search", "--work", "solo", "--query", "public path"]).results.some(
      ({ ref }) => ref === observed.ref,
    ),
  ).toBe(true);
});

test("delegation separates worker submission, coordinator acceptance and whole-work completion", (t) => {
  const project = fixture(t);
  create(project, "whole", {
    criteria: [
      criterion,
      { ...criterion, id: "integration", description: "The combined path works" },
    ],
  });
  create(project, "child", { parent: "whole", contributesTo: ["c1"] });
  change(project, "assign", "child", {
    worker: "worker-1",
    reviewer: "main",
    executionId: "host-run-1",
  });
  expect(
    invoke(project, ["work", "complete", "--work", "child"], inputFor(project, "child")).status,
  ).toBe(1);
  report(project, "child", { actor: "worker-1" });
  const submitted = change(project, "submit", "child", {
    actor: "worker-1",
    summary: "Implementation and verification are ready",
    artifacts: ["src/child.mjs"],
  });
  expect(submitted.status).toBe("submitted");
  const tree = show(project, "whole", "--tree");
  expect(tree.awaitingReview).toStrictEqual(["child"]);
  expect(
    run(project, ["recall", "--work", "whole"]).awaitingReviewWorks.map(({ id }) => id),
  ).toStrictEqual(["child"]);
  expect(
    invoke(
      project,
      ["work", "accept", "--work", "child"],
      inputFor(project, "child", {
        actor: "worker-1",
        submission: submitted.submission.ref,
        reason: "Self approval",
        evidence: ["claimed"],
      }),
    ).status,
  ).toBe(1);
  change(project, "accept", "child", {
    submission: submitted.submission.ref,
    reason: "Reviewed the criterion against the artifact",
    evidence: [submitted.ref],
  });
  report(project, "whole", {
    checks: [
      {
        criterionId: "c1",
        verdict: "met",
        observation: "The child result is integrated",
        evidence: [submitted.ref],
      },
    ],
  });
  expect(
    invoke(project, ["work", "complete", "--work", "whole"], inputFor(project, "whole")).status,
  ).toBe(1);
  report(project, "whole", {
    checks: [
      {
        criterionId: "integration",
        verdict: "met",
        observation: "The combined public path works",
        evidence: ["integration artifact"],
      },
    ],
  });
  expect(change(project, "complete", "whole").status).toBe("complete");
});

test("a blocked child cannot be hidden by a parent completion declaration or legacy checkpoint", (t) => {
  const project = fixture(t);
  create(project, "whole");
  create(project, "child", { parent: "whole", contributesTo: ["c1"] });
  change(project, "report", "child", {
    status: "blocked",
    progress: "Waiting for required input",
    next: ["Obtain the input"],
    checks: [],
  });
  report(project, "whole");
  expect(
    invoke(project, ["work", "complete", "--work", "whole"], inputFor(project, "whole")).stderr,
  ).toMatch(/child/i);
  const bypass = invoke(project, ["checkpoint", "--work", "whole"], {
    expectedRevision: 0,
    goal: "Bypass",
    status: "complete",
    progress: "Declared done",
    evidence: ["claim"],
    next: [],
    source,
  });
  expect(bypass.status).toBe(1);
  expect(bypass.stderr).toMatch(/work/i);
  expect(show(project, "whole").work.status).toBe("active");
});

test("changed definitions invalidate submissions, accepted ancestors and dependent work", (t) => {
  const project = fixture(t);
  create(project, "whole");
  create(project, "child", { parent: "whole", contributesTo: ["c1"] });
  change(project, "assign", "child", { worker: "worker-1", reviewer: "main" });
  report(project, "child", { actor: "worker-1" });
  const submitted = change(project, "submit", "child", {
    actor: "worker-1",
    summary: "Ready",
    artifacts: [],
  });
  change(project, "request-changes", "child", {
    submission: submitted.submission.ref,
    reason: "The edge case is not established",
    criteria: ["c1"],
  });
  expect(
    show(project, "child").missingCriteria.map(({ criterionId }) => criterionId),
  ).toStrictEqual(["c1"]);
  report(project, "child", { actor: "worker-1" });
  const replacement = change(project, "submit", "child", {
    actor: "worker-1",
    summary: "Corrected",
    artifacts: [],
  });
  expect(
    invoke(
      project,
      ["work", "accept", "--work", "child"],
      inputFor(project, "child", {
        submission: submitted.submission.ref,
        reason: "Old result",
        evidence: [submitted.ref],
      }),
    ).status,
  ).toBe(1);
  change(project, "accept", "child", {
    submission: replacement.submission.ref,
    reason: "Reviewed corrected result",
    evidence: [replacement.ref],
  });
  report(project, "whole");
  change(project, "complete", "whole");
  create(project, "dependent", { dependsOn: ["whole"] });
  report(project, "dependent");
  change(project, "complete", "dependent");
  change(project, "revise", "child", {
    reason: "The user changed the acceptance condition",
    criteria: [{ ...criterion, description: "The new behavior works" }],
  });
  for (const id of ["child", "whole", "dependent"]) {
    expect(show(project, id).work.status).toBe("active");
    expect(show(project, id).missingCriteria).not.toHaveLength(0);
  }
});

test("tree queries isolate related work and dependencies determine readiness without launching agents", (t) => {
  const project = fixture(t);
  create(project, "whole");
  create(project, "first", { parent: "whole", contributesTo: ["c1"] });
  create(project, "second", { parent: "whole", contributesTo: ["c1"], dependsOn: ["first"] });
  create(project, "unrelated");
  const before = show(project, "whole", "--tree");
  expect(before.works.map(({ id }) => id).sort()).toStrictEqual(["first", "second", "whole"]);
  expect(before.ready).not.toContain("second");
  const cycle = invoke(
    project,
    ["work", "revise", "--work", "first"],
    inputFor(project, "first", { reason: "Invalid dependency", dependsOn: ["second"] }),
  );
  expect(cycle.status).toBe(1);
  expect(cycle.stderr).toMatch(/cycle/i);
  report(project, "first");
  change(project, "complete", "first");
  expect(show(project, "whole", "--tree").ready).toContain("second");
});

test("concurrent reports preserve unrelated work and reject a stale update to the same work", async (t) => {
  const project = fixture(t);
  create(project, "left");
  create(project, "right");
  const input = {
    expectedRevision: 1,
    actor: "main",
    source,
    checks: [],
    progress: "Working",
    next: ["Verify"],
  };
  const separate = await Promise.all([
    concurrentRequest(project, ["work", "report", "--work", "left"], input),
    concurrentRequest(project, ["work", "report", "--work", "right"], input),
  ]);
  expect(separate.map(({ status }) => status)).toStrictEqual([0, 0]);
  const competing = await Promise.all([
    concurrentRequest(project, ["work", "report", "--work", "left"], {
      ...input,
      expectedRevision: 2,
      progress: "Observation A",
    }),
    concurrentRequest(project, ["work", "report", "--work", "left"], {
      ...input,
      expectedRevision: 2,
      progress: "Observation B",
    }),
  ]);
  expect(competing.map(({ status }) => status).sort()).toStrictEqual([0, 1]);
  expect(show(project, "right").work.revision).toBe(2);
});

test("tidy can ground memories in work history but cannot overwrite managed work state", (t) => {
  const project = fixture(t);
  const created = create(project, "managed");
  const batch = run(project, ["tidy", "prepare"]);
  expect(batch.records.some(({ ref }) => ref === created.ref)).toBe(true);
  const forged = invoke(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    works: [
      {
        id: "managed",
        goal: "Forged",
        status: "complete",
        progress: "Claim",
        evidence: [created.ref],
        next: [],
        sources: [created.ref],
      },
    ],
  });
  expect(forged.status).toBe(1);
  expect(forged.stderr).toMatch(/managed|work command/i);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [
      {
        id: "contract",
        scope: { type: "work", id: "managed" },
        text: "Preserve the agreed work contract",
        reason: "The definition records it",
        sources: [created.ref],
      },
    ],
  });
  expect(run(project, ["recall", "--work", "managed"]).memories[0].text).toContain(
    "agreed work contract",
  );
  expect(show(project, "managed").work.status).toBe("active");
  expect(run(project, ["tidy", "status"]).pendingRecords).toBe(0);
});

test("legacy work and exact refs survive explicit adoption without fabricating criterion evidence", (t) => {
  const project = fixture(t);
  const original = run(project, ["checkpoint", "--work", "legacy"], {
    expectedRevision: 0,
    goal: "Existing goal",
    status: "active",
    progress: "Original progress",
    evidence: [],
    next: ["Verify"],
    source,
  });
  const collision = invoke(project, ["work", "create", "--work", "legacy"], {
    expectedRevision: 0,
    actor: "main",
    source,
    goal: "New goal",
    scope: "Existing scope",
    criteria: [criterion],
  });
  expect(collision.status).toBe(1);
  expect(collision.stderr).toMatch(/adopt/i);
  const adopted = create(project, "legacy", { adopt: true, goal: original.goal });
  expect(adopted.legacyRef).toBe("checkpoint:legacy@1");
  expect(show(project, "legacy").missingCriteria).toHaveLength(1);
  expect(run(project, ["read", "--ref", "checkpoint:legacy@1"]).progress).toBe("Original progress");
  expect(run(project, ["recall", "--work", "legacy"]).work.managed).toBe(true);
});

test("work reads do not create storage and malformed criteria or unknown mutation fields fail", (t) => {
  const project = fixture(t);
  expect(invoke(project, ["work", "show", "--work", "missing"]).status).toBe(1);
  expect(existsSync(project.directory)).toBe(false);
  create(project, "solo");
  const badReport = invoke(
    project,
    ["work", "report", "--work", "solo"],
    inputFor(project, "solo", {
      progress: "Claim",
      next: [],
      checks: [{ criterionId: "c1", verdict: "met", observation: "Claimed", evidence: [] }],
    }),
  );
  expect(badReport.status).toBe(1);
  const unknown = invoke(
    project,
    ["work", "report", "--work", "solo"],
    inputFor(project, "solo", { progress: "Claim", next: [], checks: [], status: "complete" }),
  );
  expect(unknown.status).toBe(1);
  const unknownField = invoke(
    project,
    ["work", "report", "--work", "solo"],
    inputFor(project, "solo", { progress: "Claim", next: [], checks: [], accepted: true }),
  );
  expect(unknownField.status).toBe(1);
  expect(show(project, "solo").work.revision).toBe(1);
});

test("progress-only reporting preserves verified parent criteria and identical retries are idempotent", (t) => {
  const project = fixture(t);
  create(project, "whole");
  create(project, "child", { parent: "whole", contributesTo: ["c1"] });
  report(project, "child");
  report(project, "whole");
  const parent = show(project, "whole").work;
  const input = inputFor(project, "child", {
    progress: "Preparing the result summary",
    next: ["Submit result"],
    checks: [],
  });
  const saved = run(project, ["work", "report", "--work", "child"], input);
  const retry = run(project, ["work", "report", "--work", "child"], input);
  expect(retry.ref).toBe(saved.ref);
  expect(show(project, "whole").work.revision).toBe(parent.revision);
  expect(show(project, "whole").missingCriteria).toStrictEqual([]);
});

test("binding a host execution ID preserves an already submitted result", (t) => {
  const project = fixture(t);
  create(project, "child");
  change(project, "assign", "child", { worker: "worker-1", reviewer: "main" });
  report(project, "child", { actor: "worker-1" });
  const submitted = change(project, "submit", "child", {
    actor: "worker-1",
    summary: "Ready",
    artifacts: [],
  });
  const bound = change(project, "assign", "child", {
    worker: "worker-1",
    reviewer: "main",
    executionId: "host-run-1",
  });
  expect(bound.submission.ref).toBe(submitted.submission.ref);
  expect(bound.status).toBe("submitted");
});

test("concurrent parent completion and child reopening never leave an accepted parent over unfinished work", async (t) => {
  const project = fixture(t);
  create(project, "whole");
  create(project, "child", { parent: "whole", contributesTo: ["c1"] });
  report(project, "child");
  change(project, "complete", "child");
  report(project, "whole");
  const parentInput = inputFor(project, "whole");
  const childInput = inputFor(project, "child", { reason: "The user requested a correction" });
  const results = await Promise.all([
    concurrentRequest(project, ["work", "complete", "--work", "whole"], parentInput),
    concurrentRequest(project, ["work", "reopen", "--work", "child"], childInput),
  ]);
  expect(results[1].status).toBe(0);
  expect(show(project, "whole").work.status).toBe("active");
  expect(show(project, "child").work.status).toBe("active");
});

test("legacy note-only work requires explicit adoption and a paused parent suppresses child readiness", (t) => {
  const project = fixture(t);
  const note = run(
    project,
    ["record", "--work", "whole", "--source", "Original task"],
    "Preserve the original work goal",
  );
  const accidental = invoke(project, ["work", "create", "--work", "whole"], {
    expectedRevision: 0,
    actor: "main",
    source,
    goal: "Replacement",
    scope: "Scope",
    criteria: [criterion],
  });
  expect(accidental.status).toBe(1);
  const adopted = create(project, "whole", { adopt: true });
  expect(adopted.legacyRef).toBe(note.ref);
  create(project, "child", { parent: "whole", contributesTo: ["c1"] });
  change(project, "report", "whole", {
    status: "paused",
    progress: "User requested a pause until the next instruction",
    next: ["Wait for user resumption"],
    checks: [],
  });
  expect(show(project, "whole", "--tree").ready).not.toContain("child");
  expect(show(project, "whole", "--tree").blocked.some(({ id }) => id === "child")).toBe(true);
});

test("changing a child contribution rechecks both the previous and new parent criteria", (t) => {
  const project = fixture(t);
  create(project, "whole", { criteria: [criterion, { ...criterion, id: "c2" }] });
  create(project, "child", { parent: "whole", contributesTo: ["c1"] });
  report(project, "child");
  change(project, "complete", "child");
  report(project, "whole", {
    checks: [
      {
        criterionId: "c1",
        verdict: "met",
        observation: "Original contribution checked",
        evidence: ["original path"],
      },
      {
        criterionId: "c2",
        verdict: "met",
        observation: "Second path checked",
        evidence: ["second path"],
      },
    ],
  });
  change(project, "complete", "whole");
  change(project, "revise", "child", {
    reason: "The child now contributes to a different result",
    contributesTo: ["c2"],
  });
  expect(
    show(project, "whole")
      .missingCriteria.map(({ criterionId }) => criterionId)
      .sort(),
  ).toStrictEqual(["c1", "c2"]);
});

test("dependency invalidation preserves cancellation without adding executable next actions", (t) => {
  const project = fixture(t);
  create(project, "prerequisite");
  create(project, "cancelled", { dependsOn: ["prerequisite"] });
  change(project, "cancel", "cancelled", { reason: "The user cancelled this work" });
  report(project, "prerequisite");
  const cancelled = show(project, "cancelled").work;
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.progress).toBe("The user cancelled this work");
  expect(cancelled.next).toStrictEqual([]);
});
