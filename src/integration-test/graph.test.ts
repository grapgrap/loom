import type { Fixture } from "./testing.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { fixture, invoke, run } from "./testing.ts";

function note(project: Fixture, text: string, work = "storage") {
  return run(project, ["record", "--work", work, "--source", "User agreement"], text);
}

function entity(id: string, source: string) {
  return { id, kind: "concept", name: id, sources: [source] };
}

function statement(id: string, subject: string, object: string, source: string, overrides = {}) {
  return {
    id,
    subject,
    predicate: "assumes",
    object: { entity: object },
    text: `${subject} assumes ${object}.`,
    scope: { type: "project" },
    sources: [source],
    origin: { kind: "stated" },
    ...overrides,
  };
}

function publish(project: Fixture, graph: unknown, extra = {}) {
  const batch = run(project, ["tidy", "prepare"]);
  const input = { snapshot: batch.snapshot, graph, ...extra };
  return { input, result: run(project, ["tidy", "apply"], input) };
}

test("graph reads are empty and read-only until tidy publishes grounded statements", (t) => {
  const project = fixture(t);
  assert.deepEqual(run(project, ["graph"]).statements, []);
  assert.equal(existsSync(project.directory), false);
  const first = note(project, "The storage choice assumes one writer.");
  assert.deepEqual(run(project, ["recall", "--work", "storage"]).graph.statements, []);
  const { result, input } = publish(project, {
    entities: [entity("storage-choice", first.ref), entity("one-writer", first.ref)],
    statements: [statement("single-writer-choice", "storage-choice", "one-writer", first.ref)],
  });
  assert.equal(result.graph.statements[0].id, "single-writer-choice");
  assert.deepEqual(run(project, ["tidy", "apply"], input), result);
  const recalled = run(project, ["recall", "--query", "storage-choice"]);
  assert.equal(recalled.graph.statements[0].id, "single-writer-choice");
  assert.equal(recalled.graph.sources[0].ref, first.ref);
  assert.equal(run(project, ["read", "--ref", first.ref]).text, first.text);
});

test("replacement is published at tidy, preserves the old statement, and reports every actual change", (t) => {
  const project = fixture(t);
  const first = note(project, "Choose storage for one writer.");
  const old = statement("old-choice", "storage", "one-writer", first.ref);
  publish(
    project,
    {
      entities: [entity("storage", first.ref), entity("one-writer", first.ref)],
      statements: [old],
    },
    {
      memories: [
        {
          id: "writer-policy",
          scope: { type: "project" },
          text: "One writer.",
          reason: "Initial constraint.",
          sources: [first.ref],
        },
      ],
    },
  );
  const second = note(project, "Allow concurrent writers and review storage.");
  assert.equal(run(project, ["graph"]).statements[0].id, old.id);
  const { result } = publish(
    project,
    {
      entities: [entity("many-writers", second.ref)],
      statements: [
        statement("new-choice", "storage", "many-writers", second.ref, { supersedes: [old.id] }),
      ],
    },
    {
      memories: [
        {
          id: "writer-policy",
          scope: { type: "project" },
          text: "Concurrent writers.",
          reason: "Changed constraint.",
          sources: [second.ref],
        },
      ],
      works: [
        {
          id: "storage",
          goal: "Support concurrent writers.",
          status: "active",
          progress: "New constraint recorded.",
          next: ["Check concurrent writes."],
          evidence: [],
          sources: [second.ref],
        },
      ],
    },
  );
  assert.deepEqual(
    run(project, ["graph"]).statements.map(({ id }: { id: string }) => id),
    ["new-choice"],
  );
  const historical = run(project, ["graph", "--history"]);
  assert.equal(
    historical.statements.find(({ id }: { id: string }) => id === old.id).status,
    "superseded",
  );
  assert.deepEqual(
    historical.statements.find(({ id }: { id: string }) => id === old.id).supersededBy,
    ["new-choice"],
  );
  assert.deepEqual(
    result.report.changes.map(
      ({ kind, id, action }: { kind: string; id: string; action: string }) => [kind, id, action],
    ),
    [
      ["memory", "writer-policy", "updated"],
      ["work", "storage", "added"],
      ["entity", "many-writers", "added"],
      ["statement", "new-choice", "added"],
      ["statement", "old-choice", "superseded"],
    ],
  );
  assert.deepEqual(result.report.processed, [second.ref]);
  assert.equal(result.report.changes[0].before.text, "One writer.");
  assert.equal(result.report.changes[0].after.text, "Concurrent writers.");
});

test("graph queries preserve paths and scope, and limits disclose omitted statements", (t) => {
  const project = fixture(t);
  const source = note(project, "A depends on B; B depends on C; a different work also uses C.");
  note(project, "An unrelated work.", "other");
  publish(project, {
    entities: ["a", "b", "c", "other"].map((id) => entity(id, source.ref)),
    statements: [
      statement("a-b", "a", "b", source.ref),
      statement("b-c", "b", "c", source.ref),
      statement("other-c", "other", "c", source.ref, { scope: { type: "work", id: "other" } }),
    ],
  });
  const shallow = run(project, ["graph", "--entity", "a", "--depth", "1"]);
  assert.deepEqual(
    shallow.statements.map(({ id }: { id: string }) => id),
    ["a-b"],
  );
  const deep = run(project, ["graph", "--entity", "a", "--depth", "2"]);
  assert.deepEqual(
    deep.paths.find(({ statements }: { statements: string[] }) => statements.length === 2),
    { entities: ["a", "b", "c"], statements: ["a-b", "b-c"] },
  );
  assert.equal(
    deep.statements.some(({ id }: { id: string }) => id === "other-c"),
    false,
  );
  assert.equal(run(project, ["graph", "--work", "other"]).statements.length, 3);
  const limited = run(project, ["graph", "--limit", "1"]);
  assert.equal(limited.statements.length, 1);
  assert.equal(limited.remaining, 1);
  assert.equal(invoke(project, ["graph", "--depth", "0"]).status, 1);
});

test("bad graph references and conflicting replacements leave the graph and processing cursor intact", (t) => {
  const project = fixture(t);
  const source = note(project, "An initial condition.");
  const batch = run(project, ["tidy", "prepare"]);
  const bad = {
    snapshot: batch.snapshot,
    graph: {
      entities: [entity("a", source.ref)],
      statements: [statement("broken", "a", "missing", source.ref)],
    },
  };
  assert.match(invoke(project, ["tidy", "apply"], bad).stderr, /Unknown entity/);
  assert.equal(run(project, ["recall", "--work", "storage"]).pending.length, 1);
  const later = note(project, "A record outside the prepared snapshot.");
  assert.equal(
    invoke(project, ["tidy", "apply"], {
      snapshot: batch.snapshot,
      graph: { entities: [entity("future", later.ref)] },
    }).status,
    1,
  );
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    graph: {
      entities: [entity("a", source.ref), entity("b", source.ref)],
      statements: [statement("initial", "a", "b", source.ref)],
    },
  });
  const next = run(project, ["tidy", "prepare"]);
  const replacement = statement("replacement", "a", "b", later.ref, {
    scope: { type: "work", id: "storage" },
    supersedes: ["initial"],
  });
  assert.match(
    invoke(project, ["tidy", "apply"], {
      snapshot: next.snapshot,
      graph: { statements: [replacement] },
    }).stderr,
    /scope/,
  );
  assert.equal(run(project, ["graph"]).statements[0].id, "initial");
});

test("inferences keep premises, and forgetting a premise removes dependent graph data and report text", (t) => {
  const project = fixture(t);
  const source = note(project, "A sensitive original observation.");
  const independent = note(project, "Independent evidence for the entity names.");
  const entities = ["a", "b", "c"].map((id) => entity(id, independent.ref));
  publish(project, { entities, statements: [statement("premise", "a", "b", source.ref)] });
  const followup = note(project, "An interpretation based on the earlier observation.");
  publish(project, {
    statements: [
      statement("inference", "a", "c", followup.ref, {
        text: "A sensitive derived interpretation.",
        origin: { kind: "inferred", premises: ["premise"] },
      }),
    ],
  });
  const queried = run(project, ["graph", "--query", "interpretation", "--limit", "1"]);
  assert.equal(queried.premises[0].id, "premise");
  assert.equal(
    queried.sources.some(({ ref }: { ref: string }) => ref === source.ref),
    true,
  );
  const location = run(project, ["location"]);
  run(project, ["forget", "--ref", source.ref]);
  assert.deepEqual(run(project, ["graph", "--history"]).statements, []);
  const stored = readFileSync(join(location.projectDirectory, "tidy.json"), "utf8");
  assert.equal(stored.includes("sensitive"), false);
  assert.equal(stored.includes("derived interpretation"), false);
});

test("literal objects, unresolved statements, retirement, and no-change reports survive separate tidy batches", (t) => {
  const project = fixture(t);
  const source = note(project, "The writer count may be two.");
  const { result: initial } = publish(project, {
    entities: [entity("storage", source.ref)],
    statements: [
      statement("writer-count", "storage", "unused", source.ref, {
        predicate: "writer-count",
        object: { value: 2 },
        status: "unresolved",
      }),
    ],
  });
  assert.equal(
    initial.report.changes.find(({ kind }: { kind: string }) => kind === "statement").after.status,
    "unresolved",
  );
  note(project, "Reviewed the records without changing the graph.");
  const { result: unchanged } = publish(project, {});
  assert.deepEqual(unchanged.report.changes, []);
  const retired = note(project, "This estimate no longer applies.");
  const { result } = publish(project, {
    retire: [{ id: "writer-count", reason: retired.text, sources: [retired.ref] }],
  });
  assert.equal(result.report.changes[0].action, "retired");
  assert.deepEqual(run(project, ["graph"]).statements, []);
  assert.equal(run(project, ["graph", "--history"]).statements[0].status, "retired");
});

test("premise cycles and attempts to change a statement in place are rejected", (t) => {
  const project = fixture(t);
  const source = note(project, "Two proposed interpretations.");
  const batch = run(project, ["tidy", "prepare"]);
  const entities = [entity("a", source.ref), entity("b", source.ref)];
  const one = statement("one", "a", "b", source.ref, {
    origin: { kind: "inferred", premises: ["two"] },
  });
  const two = statement("two", "a", "b", source.ref, {
    origin: { kind: "inferred", premises: ["one"] },
  });
  assert.match(
    invoke(project, ["tidy", "apply"], {
      snapshot: batch.snapshot,
      graph: { entities, statements: [one, two] },
    }).stderr,
    /cycle/i,
  );
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    graph: { entities, statements: [statement("one", "a", "b", source.ref)] },
  });
  note(project, "A different interpretation.");
  const next = run(project, ["tidy", "prepare"]);
  assert.match(
    invoke(project, ["tidy", "apply"], {
      snapshot: next.snapshot,
      graph: { statements: [statement("one", "b", "a", source.ref)] },
    }).stderr,
    /immutable/,
  );
});

test("a replaced premise marks dependent inferences for review and includes them in the result report", (t) => {
  const project = fixture(t);
  const source = note(
    project,
    "One writer is assumed; two conclusions depend on that observation.",
  );
  publish(project, {
    entities: [entity("storage", source.ref), entity("one-writer", source.ref)],
    statements: [
      statement("premise", "storage", "one-writer", source.ref),
      statement("conclusion", "storage", "one-writer", source.ref, {
        origin: { kind: "inferred", premises: ["premise"] },
      }),
      statement("followup", "storage", "one-writer", source.ref, {
        origin: { kind: "inferred", premises: ["conclusion"] },
      }),
    ],
  });
  const changed = note(project, "The original premise no longer holds.");
  const { result } = publish(project, {
    statements: [
      statement("new-premise", "storage", "one-writer", changed.ref, {
        predicate: "rejects",
        supersedes: ["premise"],
      }),
    ],
  });
  for (const id of ["conclusion", "followup"]) {
    const statement = result.graph.statements.find(
      (statement: { id: string }) => statement.id === id,
    );
    assert.equal(statement.status, "unresolved");
    assert.equal(statement.reviewNeeded.length, 1);
    assert.equal(
      result.report.changes.find((change: { id: string }) => change.id === id).after.status,
      "unresolved",
    );
  }
});

test("forgetting an old statement's source cleans report links without removing its grounded replacement", (t) => {
  const project = fixture(t);
  const identity = note(project, "Independent identity of A and B.");
  const old = note(project, "The old decision.");
  publish(project, {
    entities: [entity("a", identity.ref), entity("b", identity.ref)],
    statements: [statement("old", "a", "b", old.ref)],
  });
  const changed = note(project, "The new decision.");
  publish(project, {
    statements: [statement("new", "a", "b", changed.ref, { supersedes: ["old"] })],
  });
  const location = run(project, ["location"]);
  run(project, ["forget", "--ref", old.ref]);
  const current = run(project, ["graph"]);
  assert.equal(current.statements[0].id, "new");
  assert.deepEqual(current.statements[0].supersedes, []);
  const history = JSON.parse(readFileSync(join(location.projectDirectory, "tidy.json"), "utf8"));
  for (const revision of history.revisions) {
    for (const change of revision.report?.changes ?? []) {
      for (const entry of [change.before, change.after].filter(Boolean)) {
        if (change.kind === "statement") assert.equal(entry.supersedes.includes("old"), false);
      }
    }
  }
});

test("a version-one consolidation is readable and upgrades without losing existing agreements", (t) => {
  const project = fixture(t);
  const source = note(project, "An existing agreement.");
  publish(
    project,
    {},
    {
      memories: [
        {
          id: "existing",
          scope: { type: "project" },
          text: source.text,
          reason: "User agreement.",
          sources: [source.ref],
        },
      ],
    },
  );
  const path = join(run(project, ["location"]).projectDirectory, "tidy.json");
  const legacy = JSON.parse(readFileSync(path, "utf8"));
  legacy.version = 1;
  for (const revision of legacy.revisions) {
    delete revision.graph;
    delete revision.report;
  }
  writeFileSync(path, JSON.stringify(legacy));
  assert.deepEqual(run(project, ["graph"]).statements, []);
  const next = note(project, "A new graph observation.");
  publish(project, { entities: [entity("new-entity", next.ref)] });
  assert.equal(JSON.parse(readFileSync(path, "utf8")).version, 2);
  assert.equal(run(project, ["recall"]).memories[0].text, source.text);
  run(project, ["forget", "--ref", next.ref]);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).version, 2);
});

test("an unresolved replacement cannot remove an accepted decision, including changes to its premises in the same batch", (t) => {
  const scenarios = [
    { name: "unresolved premise", status: "unresolved", change: () => ({}) },
    {
      name: "retired premise",
      status: "active",
      change: (ref: string) => ({
        retire: [{ id: "premise", reason: "No longer applies.", sources: [ref] }],
      }),
    },
    {
      name: "superseded premise",
      status: "active",
      change: (ref: string) => ({
        statements: [statement("new-premise", "a", "b", ref, { supersedes: ["premise"] })],
      }),
    },
  ];
  for (const scenario of scenarios) {
    const project = fixture(t);
    const first = note(project, "An accepted decision and its surrounding evidence.");
    publish(project, {
      entities: [entity("a", first.ref), entity("b", first.ref)],
      statements: [
        statement("accepted", "a", "b", first.ref),
        statement("premise", "a", "b", first.ref, { status: scenario.status }),
      ],
    });
    const before = run(project, ["graph"]);
    const next = note(project, "A replacement inferred from the premise.");
    const batch = run(project, ["tidy", "prepare"]);
    const premiseChanges: { statements?: unknown[] } = scenario.change(next.ref);
    const replacement = statement("replacement", "a", "b", next.ref, {
      origin: { kind: "inferred", premises: ["premise"] },
      supersedes: ["accepted"],
    });
    const graph = {
      ...premiseChanges,
      statements: [replacement, ...(premiseChanges.statements ?? [])],
    };
    const rejected = invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot, graph });
    assert.equal(rejected.status, 1, scenario.name);
    assert.match(rejected.stderr, /unresolved statement cannot supersede/i, scenario.name);
    assert.deepEqual(run(project, ["graph"]), before, scenario.name);
    assert.deepEqual(
      run(project, ["recall", "--work", "storage"]).pending.map(({ ref }: { ref: string }) => ref),
      [next.ref],
    );

    graph.statements[0] = { ...replacement, supersedes: [] };
    const accepted = run(project, ["tidy", "apply"], { snapshot: batch.snapshot, graph });
    assert.equal(
      accepted.graph.statements.find(({ id }: { id: string }) => id === "accepted").status,
      "active",
    );
    assert.equal(
      accepted.graph.statements.find(({ id }: { id: string }) => id === "replacement").status,
      "unresolved",
    );
  }
});

test("a sequence of accepted replacements in one batch preserves its final decision regardless of input order", (t) => {
  for (const reverse of [false, true]) {
    const project = fixture(t);
    const first = note(project, "The initial decision.");
    publish(project, {
      entities: [entity("a", first.ref), entity("b", first.ref)],
      statements: [statement("initial", "a", "b", first.ref)],
    });
    const next = note(project, "Two successive decisions replace the initial choice.");
    const statements = [
      statement("middle", "a", "b", next.ref, { supersedes: ["initial"] }),
      statement("final", "a", "b", next.ref, { supersedes: ["middle"] }),
    ];
    const { result } = publish(project, {
      statements: reverse ? statements.toReversed() : statements,
    });
    assert.equal(
      result.graph.statements.find(({ id }: { id: string }) => id === "initial").status,
      "superseded",
    );
    assert.equal(
      result.graph.statements.find(({ id }: { id: string }) => id === "middle").status,
      "superseded",
    );
    assert.deepEqual(
      run(project, ["graph"]).statements.map(({ id }: { id: string }) => id),
      ["final"],
    );
  }
});

test("a work-scoped legacy memory establishes the work for graph statements and progress", (t) => {
  const project = fixture(t);
  const scope = { type: "work", id: "legacy-work" };
  run(project, ["remember", "--id", "existing-rule"], {
    expectedRevision: 0,
    scope,
    text: "An existing work agreement.",
    reason: "User agreement.",
    source: { type: "user", reference: "User message" },
  });
  const ref = "memory:existing-rule@1";
  const batch = run(project, ["tidy", "prepare"]);
  const graph = {
    entities: [entity("a", ref), entity("b", ref)],
    statements: [
      statement("legacy-rule", "a", "b", ref, { scope: { type: "work", id: "unknown" } }),
    ],
  };
  assert.match(
    invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot, graph }).stderr,
    /Unknown work: unknown/,
  );
  graph.statements[0].scope = scope;
  const result = run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    graph,
    works: [
      {
        id: scope.id,
        goal: "Continue the existing work.",
        status: "active",
        progress: "Imported its agreement.",
        evidence: [ref],
        next: ["Review the current implementation."],
        sources: [ref],
      },
    ],
  });
  assert.equal(result.graph.statements[0].scope.id, scope.id);
  const recalled = run(project, ["recall", "--work", scope.id]);
  assert.equal(recalled.memories[0].text, "An existing work agreement.");
  assert.equal(recalled.work.id, scope.id);
  assert.deepEqual(
    recalled.graph.statements.map(({ id }: { id: string }) => id),
    ["legacy-rule"],
  );
  assert.deepEqual(recalled.pending, []);
});

test("resubmitting an unchanged replacement does not prevent later review of its retired premise", (t) => {
  const project = fixture(t);
  const first = note(project, "An initial decision and an independent premise.");
  publish(project, {
    entities: [entity("a", first.ref), entity("b", first.ref)],
    statements: [
      statement("initial", "a", "b", first.ref),
      statement("premise", "a", "b", first.ref),
    ],
  });
  const second = note(project, "An accepted replacement supported by the premise.");
  const replacement = statement("accepted-replacement", "a", "b", second.ref, {
    origin: { kind: "inferred", premises: ["premise"] },
    supersedes: ["initial"],
  });
  publish(project, { statements: [replacement] });
  const retired = note(project, "The premise no longer applies.");
  const { result } = publish(project, {
    statements: [replacement],
    retire: [{ id: "premise", reason: retired.text, sources: [retired.ref] }],
  });
  assert.equal(
    result.graph.statements.find(({ id }: { id: string }) => id === "initial").status,
    "superseded",
  );
  assert.equal(
    result.graph.statements.find(({ id }: { id: string }) => id === replacement.id).status,
    "unresolved",
  );
  assert.deepEqual(
    result.report.changes.map(({ id }: { id: string }) => id),
    ["accepted-replacement", "premise"],
  );
});
