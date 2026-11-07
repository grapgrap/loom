import { expect, test } from "vitest";
import { fixture, run, invoke } from "./testing.ts";

function decision(key: string, text: string) {
  return {
    requestKey: key,
    scope: { type: "work", id: "combat" },
    text,
    kind: "decision",
    standing: "adopted",
    applies: { target: "build-c", conditions: ["combat"], lifetime: "until-corrected" },
    source: { type: "user", reference: "fixture conversation" },
    capture: "direct",
  };
}

test("misplaced target versions are rejected while applicability versions survive storage and discovery", (t) => {
  const p = fixture(t);
  const input = decision("versioned", "Observed behavior.");
  const rejected = invoke(p, ["evidence", "append"], { ...input, targetVersion: "release42" });
  expect(rejected.status).toBe(1);
  expect(rejected.stderr).toContain("applies.targetVersion");
  expect(run(p, ["evidence", "result", "--key", input.requestKey])).toBe(null);
  const saved = run(p, ["evidence", "append"], {
    ...input,
    applies: { ...input.applies, targetVersion: "release42" },
  });
  expect(run(p, ["read", "--ref", saved.ref]).applies.targetVersion).toBe("release42");
  expect(
    run(p, ["discover", "--query", "release42"]).results.map((r: { ref: string }) => r.ref),
  ).toContain(saved.ref);
});

test("a correction outside discovery scope reaches the agent with its exact original", (t) => {
  const p = fixture(t);
  const first = run(p, ["evidence", "append"], decision("first", "focus forbids ordinary attacks"));
  const basis = run(p, ["evidence", "check"], { seeds: [first.ref] }).basis;
  const replacement = run(p, ["evidence", "correct"], {
    ...decision("replacement", "ordinary attacks are now allowed"),
    scope: { type: "work", id: "later-work" },
    kind: "correction",
    basis,
    relation: { type: "replaces", target: first.ref, applies: decision("x", "x").applies },
  });
  const prepared = run(p, ["context", "prepare"], { query: "focus", work: "combat" });
  expect(prepared.changes.records.map((r: { ref: string }) => r.ref)).toContain(replacement.ref);
  expect(prepared.originals.map((r: { ref: string }) => r.ref)).toContain(first.ref);
  expect(prepared.changes.coverage).toBe("complete");
  expect(prepared).not.toHaveProperty("applicable");
  expect(run(p, ["read", "--ref", first.ref]).text).toContain("forbids");
});

test("a new independent observation invalidates the discovery basis without a correction", (t) => {
  const p = fixture(t);
  run(p, ["evidence", "append"], decision("first", "acceleration lasts three seconds"));
  const previous = run(p, ["context", "prepare"], { query: "acceleration" });
  run(p, ["evidence", "append"], {
    ...decision("experiment", "acceleration experiment now lasts 1.5 seconds"),
    kind: "observation",
    standing: "observed",
    source: { type: "agent", reference: "run-2" },
  });
  const current = run(p, ["context", "prepare"], { query: "acceleration", prior: previous.basis });
  expect(current.refresh.discovery).toBe("changed");
  expect(current.candidates.length).toBe(2);
});

test("discovery finds an evidence target and conditions stored outside its prose", (t) => {
  const p = fixture(t);
  const record = run(p, ["evidence", "append"], {
    ...decision("specific", "Permit the requested behavior."),
    applies: {
      target: "singleflight",
      targetVersion: "release42",
      conditions: ["linux26"],
      lifetime: "until-corrected",
    },
  });
  for (const query of ["singleflight", "release42", "linux26"])
    expect(
      run(p, ["discover", "--query", query]).results.map((r: { ref: string }) => r.ref),
    ).toContain(record.ref);
});

test("discovery groups history but preserves independent notes and rejects stale pages", (t) => {
  const p = fixture(t);
  const input = {
    expectedRevision: 0,
    actor: "main",
    source: { type: "user", reference: "fixture" },
    goal: "acceleration prototype",
    scope: "acceleration",
    criteria: [{ id: "done", description: "done", verification: "inspect" }],
  };
  let work = run(p, ["work", "create", "--work", "combat"], input);
  for (let i = 0; i < 4; i++)
    work = run(p, ["work", "report", "--work", "combat"], {
      expectedRevision: work.revision,
      actor: "main",
      source: input.source,
      progress: "acceleration observation",
      next: ["continue"],
    });
  const note = run(
    p,
    ["record", "--work", "combat", "--source", "fixture"],
    "acceleration exception",
  );
  const found = run(p, ["discover", "--query", "acceleration", "--limit", "2"]);
  expect(found.results).toHaveLength(2);
  expect(found.results.some((r: { ref: string }) => r.ref === note.ref)).toBe(true);
  const page = run(p, ["discover", "--query", "acceleration", "--limit", "1"]);
  run(p, ["record", "--work", "combat", "--source", "fixture"], "acceleration second exception");
  const stale = invoke(p, [
    "discover",
    "--query",
    "acceleration",
    "--limit",
    "1",
    "--cursor",
    page.next,
  ]);
  expect(stale.status).toBe(1);
  expect(stale.stderr).toContain("conflict");
});

test("derived vocabulary is discoverable without becoming an independent authority", (t) => {
  const p = fixture(t);
  const note = run(
    p,
    ["record", "--work", "queue", "--source", "fixture"],
    "pause producer while the queue is full",
  );
  const batch = run(p, ["tidy", "prepare", "--work", "queue"]);
  run(p, ["tidy", "apply", "--full"], {
    snapshot: batch.snapshot,
    memories: [
      {
        id: "pressure",
        scope: { type: "work", id: "queue" },
        text: "backpressure",
        reason: "discovery term",
        sources: [note.ref],
        status: "active",
      },
    ],
  });
  const found = run(p, ["discover", "--query", "backpressure"]);
  expect(found.results[0].sources).toContain(note.ref);
  expect(found.results[0].representation.text).toBe("backpressure");
  expect(found.results[0].role).toBe("derived");
});

test("a successful capture survives a conflicting work report and both results can be recovered", (t) => {
  const p = fixture(t);
  const source = { type: "agent", reference: "fixture verification" };
  const created = run(p, ["work", "create", "--work", "combat"], {
    requestKey: "create-combat",
    expectedRevision: 0,
    actor: "main",
    source,
    goal: "Verify the combat observation",
    scope: "one observation",
    criteria: [
      { id: "observed", description: "Observed current behavior", verification: "fixture run" },
    ],
  });
  const captured = run(p, ["evidence", "append"], decision("observation", "focus permits attacks"));
  const check = {
    criterionId: "observed",
    verdict: "met",
    observation: "Fixture behavior confirmed",
    evidence: [captured.ref],
    basis: {
      work: created.ref,
      definition: created.definitionRevision,
      target: "combat fixture",
      version: "fixture-1",
      conditions: ["isolated temporary project"],
    },
  };
  const report = {
    requestKey: "report-combat",
    expectedRevision: 0,
    actor: "main",
    source,
    progress: "Observed behavior",
    next: [],
    checks: [check],
  };
  const conflict = invoke(p, ["work", "report", "--work", "combat"], report);
  expect(conflict.status).toBe(1);
  expect(conflict.stderr).toContain('"outcome":"conflict"');
  expect(run(p, ["evidence", "result", "--key", "observation"]).ref).toBe(captured.ref);
  expect(run(p, ["work", "result", "--key", "report-combat"])).toBe(null);
  const saved = run(p, ["work", "report", "--work", "combat"], {
    ...report,
    expectedRevision: created.revision,
  });
  run(p, ["work", "complete", "--work", "combat"], {
    requestKey: "complete-combat",
    expectedRevision: saved.revision,
    actor: "main",
    source,
  });
  expect(run(p, ["work", "result", "--key", "report-combat"]).ref).toBe(saved.ref);
  expect(run(p, ["work", "show", "--work", "combat"]).work.status).toBe("complete");
});

test("a scoped no-change review leaves unread earlier notes pending and is recoverable", (t) => {
  const p = fixture(t);
  const earlier = run(
    p,
    ["record", "--work", "queue", "--source", "fixture"],
    "earlier unread boundary",
  );
  const later = run(
    p,
    ["record", "--work", "queue", "--source", "fixture"],
    "selected later boundary",
  );
  const batch = run(p, ["tidy", "prepare", "--work", "queue", "--query", "selected"]);
  expect(batch.batch).toEqual([later.ref]);
  const applied = run(p, ["tidy", "apply", "--full"], {
    snapshot: batch.snapshot,
    requestKey: "review-selected",
    reviewed: batch.batch,
    read: batch.batch,
    reason: "This observation adds no reusable constraint.",
  });
  expect(applied.effect).toBe("no-change");
  expect(applied.revision).toBe(0);
  expect(run(p, ["recall", "--work", "queue"]).pending.map((r: { ref: string }) => r.ref)).toEqual([
    earlier.ref,
  ]);
  expect(run(p, ["tidy", "result", "--key", "review-selected"])).toEqual(applied);
  const repeated = run(p, ["tidy", "prepare", "--work", "queue", "--query", "selected"]);
  expect(repeated.snapshot).toBe(null);
  expect(repeated.reviewed).toBe(true);
  expect(run(p, ["tidy", "status", "--work", "queue", "--query", "selected"]).needed).toBe(false);
});
