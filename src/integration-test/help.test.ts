import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, invoke, run } from "./testing.ts";

function example(text: string) {
  return JSON.parse(text.match(/```json\n([\s\S]+?)\n```/)![1]);
}

function input(p: ReturnType<typeof fixture>, ...command: string[]) {
  const result = invoke(p, [...command, "--help"]);
  expect(result.status, result.stderr).toBe(0);
  return example(result.stdout);
}

test("command help works outside a repository and does not create storage", (t) => {
  const p = fixture(t);
  const result = invoke(p, ["evidence", "append", "--help"], undefined, join(p.root, "missing"));
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("applies");
  expect(result.stdout).toContain("targetVersion");
  expect(result.stdout).not.toContain("Commands:");
  expect(existsSync(p.directory)).toBe(false);
});

test("help examples create a work and an evidence record with the documented input", (t) => {
  const p = fixture(t);
  const workHelp = invoke(p, ["work", "create", "--help"]);
  const created = run(p, ["work", "create", "--work", "example"], example(workHelp.stdout));
  expect(created.goal).toBeTruthy();
  const evidenceHelp = invoke(p, ["evidence", "append", "--help"]);
  const captured = run(p, ["evidence", "append"], example(evidenceHelp.stdout));
  expect(captured.outcome).toBe("applied");
  expect(run(p, ["evidence", "read", "--ref", captured.ref]).ref).toBe(captured.ref);
});

test("group help lists its commands and invalid options list allowed flags", (t) => {
  const p = fixture(t);
  const group = invoke(p, ["work", "--help"]);
  expect(group.status).toBe(0);
  expect(group.stdout).toContain("work create");
  expect(group.stdout).not.toContain("evidence append");
  const wrong = invoke(p, ["tidy", "status", "--limit", "1"]);
  expect(wrong.status).toBe(1);
  expect(wrong.stderr).toContain("--limit");
  expect(wrong.stderr).toContain("--purpose");
  expect(wrong.stderr).toContain("tidy status --help");
  expect(existsSync(p.directory)).toBe(false);
});

test("unknown operations fail and list available commands", (t) => {
  const p = fixture(t);
  const result = invoke(p, ["work", "creat", "--help"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("work create");
  expect(existsSync(p.directory)).toBe(false);
});

test("work help examples support reporting and completion with an observed basis", (t) => {
  const p = fixture(t);
  const created = run(p, ["work", "create", "--work", "example"], input(p, "work", "create"));
  const report = input(p, "work", "report");
  report.expectedRevision = created.revision;
  report.checks[0].basis = {
    work: created.ref,
    definition: created.definitionRevision,
    target: "help example fixture",
    version: "fixture-v1",
    conditions: ["temporary repository"],
  };
  const reported = run(p, ["work", "report", "--work", "example"], report);
  const completed = run(p, ["work", "complete", "--work", "example"], {
    ...input(p, "work", "complete"),
    expectedRevision: reported.revision,
  });
  expect(completed.status).toBe("complete");
  expect(run(p, ["work", "result", "--key", report.requestKey]).ref).toBe(reported.ref);
});

test("correction, context preparation and no-change tidy examples use bases from actual reads", (t) => {
  const p = fixture(t);
  const original = run(p, ["evidence", "append"], input(p, "evidence", "append"));
  const checked = run(p, ["evidence", "check"], {
    ...input(p, "evidence", "check"),
    seeds: [original.ref],
  });
  const correction = input(p, "evidence", "correct");
  correction.basis = checked.basis;
  correction.relation.target = original.ref;
  const corrected = run(p, ["evidence", "correct"], correction);
  const preparation = input(p, "context", "prepare");
  delete preparation.work;
  preparation.refs = [original.ref];
  const context = run(p, ["context", "prepare"], preparation);
  expect(context.changes.records.map((r: { ref: string }) => r.ref)).toContain(corrected.ref);
  const prepared = run(p, ["tidy", "prepare"]);
  const applied = run(p, ["tidy", "apply"], {
    ...input(p, "tidy", "apply"),
    snapshot: prepared.snapshot,
    reviewed: prepared.batch,
    read: prepared.batch,
  });
  expect(applied.effect).toBe("no-change");
  expect(run(p, ["tidy", "prepare"]).snapshot).toBe(null);
});
