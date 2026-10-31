import type { WorkLedger } from "../context/work/model.ts";
import type { Fixture } from "./testing.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, invoke, run } from "./testing.ts";

const source = { type: "agent", reference: "Work-ledger boundary regression" };

function submission(project: Fixture) {
  let work = run(project, ["work", "create", "--work", "result"], {
    expectedRevision: 0,
    actor: "main",
    source,
    goal: "Deliver result",
    scope: "Stored submission boundary",
    criteria: [
      { id: "proof", description: "The result works", verification: "Observe the result" },
    ],
  });
  for (const [action, input] of [
    ["assign", { worker: "worker", reviewer: "main" }],
    [
      "report",
      {
        actor: "worker",
        progress: "Verified",
        next: [],
        checks: [
          { criterionId: "proof", verdict: "met", observation: "Observed", evidence: ["artifact"] },
        ],
      },
    ],
    ["submit", { actor: "worker", summary: "Ready", artifacts: [] }],
  ] as const) {
    work = run(project, ["work", action, "--work", "result"], {
      expectedRevision: work.revision,
      actor: "main",
      source,
      ...input,
    });
  }
  const location = run(project, ["location"]);
  return { work, path: join(location.projectDirectory, "work-state.json") };
}

test("malformed saved submission checks fail show, exact read and accept before another revision is written", (t) => {
  const project = fixture(t);
  const { work, path } = submission(project);
  const ledger: WorkLedger = JSON.parse(readFileSync(path, "utf8"));
  Object.assign(ledger.works[0].revisions.at(-1)!.submission!, { checks: null });
  const malformed = JSON.stringify(ledger);
  writeFileSync(path, malformed);
  for (const [args, input] of [
    [["work", "show", "--work", "result"], undefined],
    [["read", "--ref", work.ref], undefined],
    [
      ["work", "accept", "--work", "result"],
      {
        expectedRevision: work.revision,
        actor: "main",
        source,
        submission: work.submission.ref,
        reason: "Reviewed",
        evidence: ["review artifact"],
      },
    ],
  ] as const) {
    const result = invoke(project, [...args], input);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Invalid record at ${path}`);
    expect(result.stderr).toMatch(/submission.checks/);
    expect(readFileSync(path, "utf8")).toBe(malformed);
  }
});

test("malformed saved review evidence fails at the ledger boundary with record context", (t) => {
  const project = fixture(t);
  const { work, path } = submission(project);
  run(project, ["work", "accept", "--work", "result"], {
    expectedRevision: work.revision,
    actor: "main",
    source,
    submission: work.submission.ref,
    reason: "Reviewed",
    evidence: ["review artifact"],
  });
  const ledger: WorkLedger = JSON.parse(readFileSync(path, "utf8"));
  Object.assign(ledger.works[0].revisions.at(-1)!.submission!.review!, { evidence: 7 });
  writeFileSync(path, JSON.stringify(ledger));
  const result = invoke(project, ["work", "show", "--work", "result"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`Invalid record at ${path}`);
  expect(result.stderr).toMatch(/submission.review.evidence/);
});
