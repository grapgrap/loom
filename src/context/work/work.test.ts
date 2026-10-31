import type { WorkLedger, WorkRevision } from "./model.ts";
import { expect, test } from "vitest";
import { changeWork, currentWorks, parseWorkLedger } from "./work.ts";

const source = { type: "agent", reference: "Observed work boundary contract" };
const criterion = { id: "proof", description: "The result works", verification: "Observe it" };
const check = {
  criterionId: "proof",
  verdict: "met",
  observation: "The result was observed",
  evidence: ["verified artifact"],
};

function scenario() {
  let ledger: WorkLedger | null = null;
  return {
    change(id: string, action: string, input = {}, options = {}) {
      ledger = changeWork(
        ledger,
        id,
        action,
        {
          expectedRevision: currentWorks(ledger).get(id)?.revision ?? 0,
          actor: "main",
          source,
          ...input,
        },
        options,
      );
      return currentWorks(ledger).get(id)!;
    },
    get ledger(): WorkLedger {
      return ledger!;
    },
  };
}

function submitted() {
  const context = scenario();
  context.change("result", "create", {
    goal: "Deliver result",
    scope: "Work boundary",
    criteria: [criterion],
  });
  context.change("result", "assign", { worker: "worker", reviewer: "main" });
  context.change("result", "report", {
    actor: "worker",
    progress: "Verified",
    checks: [check],
    next: [],
  });
  context.change("result", "submit", {
    actor: "worker",
    summary: "Ready",
    artifacts: ["result.txt"],
  });
  return context;
}

function accepted() {
  const context = submitted();
  const ref = currentWorks(context.ledger).get("result")!.submission!.ref;
  context.change("result", "accept", {
    submission: ref,
    reason: "Reviewed",
    evidence: ["review artifact"],
  });
  return context;
}

function corrupt(context: ReturnType<typeof scenario>, mutate: (work: WorkRevision) => void) {
  const ledger = structuredClone(context.ledger);
  mutate(currentWorks(ledger).get("result")!);
  return ledger;
}

test.each([
  ["checks must be an array", null],
  ["checks cover every criterion", []],
  ["checks have known criteria", [{ ...check, criterionId: "other" }]],
  ["checks have evidence", [{ ...check, evidence: [] }]],
  ["checks are verified", [{ ...check, verdict: "unknown" }]],
  ["checks have observations", [{ ...check, observation: "" }]],
])("stored submission %s", (_name, checks) => {
  expect(() =>
    parseWorkLedger(corrupt(submitted(), (work) => Object.assign(work.submission!, { checks }))),
  ).toThrowError();
});

test.each([
  ["definition revision is positive", { definitionRevision: 0 }],
  ["definition revision matches the work", { definitionRevision: 99 }],
  ["ref identifies this work", { ref: "work:other@4" }],
  ["ref identifies an existing submission", { ref: "work:result@1" }],
  ["ref cannot identify a future revision", { ref: "work:result@99" }],
  [
    "frozen checks match the submitted result",
    { checks: [{ ...check, observation: "Changed after submission" }] },
  ],
  ["summary remains frozen", { summary: "Changed after submission" }],
  ["artifacts remain frozen", { artifacts: ["replacement.txt"] }],
])("stored submission %s", (_name, fields) => {
  expect(() =>
    parseWorkLedger(corrupt(accepted(), (work) => Object.assign(work.submission!, fields))),
  ).toThrowError();
});

test.each([
  ["review payload is an object", []],
  ["review has a supported verdict", { verdict: "approved" }],
  ["review identifies the assigned reviewer", { actor: "someone-else" }],
  ["review has a reason", { reason: "" }],
  ["review evidence is an array", { evidence: 7 }],
  ["accepted review has evidence", { evidence: [] }],
  ["review has a valid source", { source: { type: "observer", reference: "Review" } }],
])("stored %s", (_name, fields) => {
  const ledger = corrupt(accepted(), (work) => {
    if (Array.isArray(fields)) Object.assign(work.submission!, { review: fields });
    else Object.assign(work.submission!.review!, fields);
  });
  expect(() => parseWorkLedger(ledger)).toThrowError();
});

test("a stored accepted review cannot appear on an executing work", () => {
  expect(() =>
    parseWorkLedger(
      corrupt(accepted(), (work) => {
        work.status = "active";
      }),
    ),
  ).toThrowError();
});

test("a resubmission cannot reuse the previous submission ref even when its payload is unchanged", () => {
  const context = submitted();
  const first = currentWorks(context.ledger).get("result")!.submission!;
  context.change("result", "request-changes", { submission: first.ref, reason: "Recheck" });
  context.change("result", "report", {
    actor: "worker",
    progress: "Rechecked",
    checks: [check],
    next: [],
  });
  context.change("result", "submit", {
    actor: "worker",
    summary: first.summary,
    artifacts: first.artifacts,
  });
  const ledger = corrupt(context, (work) => {
    work.submission!.ref = first.ref;
  });
  expect(() => parseWorkLedger(ledger)).toThrowError(/submission.ref/);
});

test("stored work timestamps must be strings before date parsing", () => {
  expect(() =>
    parseWorkLedger(corrupt(submitted(), (work) => Object.assign(work, { recordedAt: 0 }))),
  ).toThrowError(/recordedAt/);
});

test("changes-requested snapshots survive progress, blocked and paused reports until replacement or reassignment", () => {
  const context = submitted();
  const first = currentWorks(context.ledger).get("result")!.submission!;
  context.change("result", "request-changes", {
    submission: first.ref,
    reason: "Recheck proof",
    criteria: ["proof"],
  });
  for (const status of ["blocked", "paused", "active"]) {
    context.change("result", "report", {
      actor: "worker",
      status,
      progress: "Waiting for the next check",
      checks: [],
      next: ["Recheck"],
    });
    expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
  }
  context.change("result", "report", {
    actor: "worker",
    progress: "New observation",
    checks: [{ ...check, observation: "Rechecked" }],
    next: [],
  });
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
  context.change("result", "assign", { worker: "replacement", reviewer: "reviewer" });
  expect(currentWorks(context.ledger).get("result")!.submission).toBeNull();
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
});

test("submission payloads remain valid across execution binding, resubmission, acceptance and reopening", () => {
  const context = submitted();
  const original = currentWorks(context.ledger).get("result")!.submission!;
  context.change("result", "assign", {
    worker: "worker",
    reviewer: "main",
    executionId: "host-run",
  });
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
  context.change("result", "request-changes", { submission: original.ref, reason: "Recheck" });
  context.change("result", "report", {
    actor: "worker",
    progress: "Rechecked",
    checks: [{ ...check, observation: "Rechecked" }],
    next: [],
  });
  const replacement = context.change("result", "submit", {
    actor: "worker",
    summary: "Corrected",
    artifacts: [],
  });
  context.change("result", "accept", {
    submission: replacement.submission!.ref,
    reason: "Reviewed correction",
    evidence: ["review artifact"],
  });
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
  context.change("result", "reopen", { reason: "New user request" });
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
  context.change("result", "revise", {
    reason: "New condition",
    criteria: [{ ...criterion, description: "Updated result" }],
  });
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
});

test("historical accepted submissions remain valid when a dependency invalidates current work", () => {
  const context = scenario();
  for (const id of ["prerequisite", "result"]) {
    context.change(id, "create", {
      goal: `Deliver ${id}`,
      scope: "Dependency contract",
      criteria: [criterion],
      dependsOn: id === "result" ? ["prerequisite"] : [],
    });
    if (id === "result") context.change(id, "assign", { worker: "worker", reviewer: "main" });
    context.change(id, "report", {
      actor: id === "result" ? "worker" : "main",
      progress: "Verified",
      checks: [check],
      next: [],
    });
    if (id === "prerequisite") context.change(id, "complete");
    else {
      const work = context.change(id, "submit", { actor: "worker", summary: "Ready" });
      context.change(id, "accept", {
        submission: work.submission!.ref,
        reason: "Reviewed",
        evidence: ["review"],
      });
    }
  }
  context.change("prerequisite", "reopen", { reason: "The dependency changed" });
  const result = currentWorks(context.ledger).get("result")!;
  expect(result.status).toBe("active");
  expect(result.submission).toBeNull();
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
});

test("legacy adoption and unrelated stored metadata remain readable", () => {
  const context = scenario();
  context.change(
    "result",
    "create",
    { goal: "Continue work", scope: "Legacy adoption", criteria: [criterion], adopt: true },
    { legacyRef: "checkpoint:result@1" },
  );
  const ledger = corrupt(context, (work) =>
    Object.assign(work, { extra: { format: "external metadata" } }),
  );
  expect(parseWorkLedger(ledger)).toBe(ledger);
  expect(currentWorks(ledger).get("result")!.legacyRef).toBe("checkpoint:result@1");
  const reviewed = corrupt(accepted(), (work) => {
    Object.assign(work.submission!, { extra: { format: "submission metadata" } });
    Object.assign(work.submission!.review!, { extra: { format: "review metadata" } });
  });
  expect(parseWorkLedger(reviewed)).toBe(reviewed);
});
