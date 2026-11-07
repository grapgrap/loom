import type { WorkLedger, WorkRevision } from "./model.ts";
import { expect, test } from "vitest";
import { changeWork, currentWorks, parseWorkLedger, presentWork } from "./work.ts";

const source = { type: "agent", reference: "Observed work contract" };
const criterion = { id: "proof", description: "The result works", verification: "Observe it" };
const check = {
  criterionId: "proof",
  verdict: "met",
  observation: "The result was observed",
  evidence: ["test artifact"],
};
const definition = { goal: "Deliver result", scope: "Work contract", criteria: [criterion] };

function scenario() {
  let ledger: WorkLedger | null = null;
  return {
    change(id: string, action: string, input = {}) {
      ledger = changeWork(ledger, id, action, {
        expectedRevision: currentWorks(ledger).get(id)?.revision ?? 0,
        actor: "main",
        source,
        ...input,
      });
      return currentWorks(ledger).get(id)!;
    },
    get ledger(): WorkLedger {
      return ledger!;
    },
  };
}

function basis(work: WorkRevision) {
  return {
    work: `work:${work.id}@${work.revision}`,
    definition: work.definitionRevision,
    target: "/checkout/src/result.ts",
    version: "commit:observed-result",
    conditions: ["Node 24; public result path"],
  };
}

test("a request key survives later changes to the same and other work", () => {
  const context = scenario();
  const input = {
    expectedRevision: 0,
    requestKey: "create-result",
    ...definition,
  };
  context.change("result", "create", input);
  context.change("result", "report", { progress: "Working", next: ["Verify"] });
  context.change("other", "create", definition);
  const before = context.ledger;
  context.change("result", "create", input);
  expect(context.ledger).toBe(before);
  expect(currentWorks(context.ledger).get("result")!.revision).toBe(2);
});

test("a request key is shared across work IDs and cannot be reused for different payloads", () => {
  const context = scenario();
  context.change("result", "create", { ...definition, requestKey: "shared-key" });
  expect(() =>
    context.change("other", "create", { ...definition, requestKey: "shared-key" }),
  ).toThrowError(/request key.*different|different.*request key/i);
  expect(() =>
    context.change("result", "create", {
      ...definition,
      requestKey: "shared-key",
      expectedRevision: 1,
    }),
  ).toThrowError(/request key.*different|different.*request key/i);
  expect(currentWorks(context.ledger).has("other")).toBe(false);
});

test("reordering JSON object fields preserves a keyed request's payload identity", () => {
  const input = {
    expectedRevision: 0,
    actor: "main",
    source,
    requestKey: "stable-payload",
    ...definition,
  };
  const saved = changeWork(null, "result", "create", input);
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  expect(changeWork(saved, "result", "create", reordered)).toBe(saved);
});

test("a keyed verified report needs the observed target and work definition basis", () => {
  const context = scenario();
  const work = context.change("result", "create", definition);
  const report = { progress: "Verified", next: [], checks: [check], requestKey: "verify" };
  expect(() => context.change("result", "report", report)).toThrowError(/basis/i);
  const observed = { ...check, basis: basis(work) };
  const reported = context.change("result", "report", { ...report, checks: [observed] });
  expect(presentWork(reported).checks).toStrictEqual([observed]);
});

test("a late check retains its observed work ref across progress-only revisions", () => {
  const context = scenario();
  const work = context.change("result", "create", definition);
  context.change("result", "report", { progress: "Waiting for verification", next: ["Verify"] });
  const observed = { ...check, basis: basis(work) };
  const result = context.change("result", "report", {
    progress: "Verified the original definition",
    next: [],
    checks: [observed],
    requestKey: "late-check",
  });
  expect(result.checks).toStrictEqual([observed]);
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
});

test("a changed definition rejects a late check without writing another revision", () => {
  const context = scenario();
  const work = context.change("result", "create", definition);
  context.change("result", "revise", { reason: "A new target", scope: "A changed scope" });
  const before = context.ledger;
  expect(() =>
    context.change("result", "report", {
      progress: "The previous result passed",
      next: [],
      checks: [{ ...check, basis: basis(work) }],
      requestKey: "stale-check",
    }),
  ).toThrowError(/definition.*stale|stale.*definition/i);
  expect(context.ledger).toBe(before);
});

test.each([
  ["unknown work ref", { work: "work:other@1" }],
  ["nonexistent work revision", { work: "work:result@99" }],
  ["inaccurate definition", { definition: 99 }],
  ["empty target", { target: "" }],
  ["empty target version", { version: "" }],
  ["missing execution conditions", { conditions: undefined }],
])("a check basis rejects %s", (_name, replacement) => {
  const context = scenario();
  const work = context.change("result", "create", definition);
  expect(() =>
    context.change("result", "report", {
      progress: "Verified",
      next: [],
      requestKey: "invalid-basis",
      checks: [{ ...check, basis: { ...basis(work), ...replacement } }],
    }),
  ).toThrowError();
});

test("a version 1 ledger remains readable without promoting legacy checks to observed basis", () => {
  const context = scenario();
  context.change("result", "create", definition);
  context.change("result", "report", {
    progress: "Legacy verification",
    next: [],
    checks: [check],
  });
  const legacy = structuredClone(context.ledger);
  legacy.version = 1;
  const before = JSON.stringify(legacy);
  expect(parseWorkLedger(legacy)).toBe(legacy);
  expect(JSON.stringify(legacy)).toBe(before);
  context.change("result", "report", {
    progress: "A new progress update",
    next: [],
    requestKey: "new-progress",
  });
  expect(context.ledger.version).toBe(2);
  expect(currentWorks(context.ledger).get("result")!.checks).toStrictEqual([check]);
});

test.each(["complete", "submit", "accept"])(
  "a keyed %s cannot promote legacy checks to newly verified completion",
  (action) => {
    const context = scenario();
    context.change("result", "create", definition);
    if (action !== "complete")
      context.change("result", "assign", { worker: "worker", reviewer: "main" });
    context.change("result", "report", {
      progress: "Legacy verification",
      next: [],
      checks: [check],
    });
    if (action === "accept") context.change("result", "submit", { summary: "Legacy submission" });
    const before = context.ledger;
    expect(() =>
      context.change("result", action, {
        requestKey: "new-completion",
        ...(action === "submit" ? { summary: "Ready" } : {}),
        ...(action === "accept"
          ? {
              submission: currentWorks(context.ledger).get("result")!.submission!.ref,
              reason: "Reviewed",
              evidence: ["review artifact"],
            }
          : {}),
      }),
    ).toThrowError(/basis|legacy/i);
    expect(context.ledger).toBe(before);
    expect(parseWorkLedger(before)).toBe(before);
  },
);

test("automatic invalidation cannot claim or copy another operation's request key", () => {
  const context = scenario();
  context.change("parent", "create", { ...definition, requestKey: "create-parent" });
  context.change("child", "create", {
    ...definition,
    parent: "parent",
    contributesTo: ["proof"],
    requestKey: "create-child",
  });
  const parent = currentWorks(context.ledger).get("parent")!;
  expect(parent.action).toBe("invalidated");
  expect(parent.requestKey).toBeUndefined();
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
  const before = context.ledger;
  context.change("parent", "create", {
    expectedRevision: 0,
    ...definition,
    requestKey: "create-parent",
  });
  expect(context.ledger).toBe(before);
});

test("keyed delegation preserves the observed basis through submission and acceptance", () => {
  const context = scenario();
  context.change("result", "create", { ...definition, requestKey: "define" });
  const assigned = context.change("result", "assign", {
    worker: "worker",
    reviewer: "main",
    requestKey: "assign",
  });
  const input = {
    expectedRevision: assigned.revision,
    progress: "Verified",
    next: [],
    requestKey: "verify",
    checks: [{ ...check, basis: basis(assigned) }],
  };
  context.change("result", "report", input);
  const submitted = context.change("result", "submit", {
    summary: "Ready",
    artifacts: ["result.ts"],
    requestKey: "submit",
  });
  const accepted = context.change("result", "accept", {
    submission: submitted.submission!.ref,
    reason: "Reviewed the result",
    evidence: ["review artifact"],
    requestKey: "accept",
  });
  expect(accepted.status).toBe("complete");
  expect(accepted.submission!.checks).toStrictEqual(input.checks);
  expect(parseWorkLedger(context.ledger)).toBe(context.ledger);
  const before = context.ledger;
  context.change("result", "report", input);
  expect(context.ledger).toBe(before);
});

test("stored keyed reports cannot lose their observed basis and appear as legacy checks", () => {
  const context = scenario();
  const work = context.change("result", "create", definition);
  context.change("result", "report", {
    progress: "Verified",
    next: [],
    requestKey: "verify",
    checks: [{ ...check, basis: basis(work) }],
  });
  const malformed = structuredClone(context.ledger);
  delete currentWorks(malformed).get("result")!.checks[0].basis;
  expect(() => parseWorkLedger(malformed)).toThrowError(/basis|legacy/i);
});
