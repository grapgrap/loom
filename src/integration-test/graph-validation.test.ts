import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, invoke, run } from "./testing.ts";

function entity(ref: string) {
  return { id: "policy", kind: "concept", name: "Policy", sources: [ref] };
}

function statement(ref: string, overrides = {}) {
  return {
    id: "current",
    subject: "policy",
    predicate: "enabled",
    object: { value: false },
    text: "The policy is disabled.",
    scope: { type: "project" },
    sources: [ref],
    origin: { kind: "stated" },
    ...overrides,
  };
}

for (const [name, overrides, field] of [
  ["status typo", { status: "actve" }, "statement.status"],
  ["direct retirement", { status: "retired" }, "statement.status"],
  ["direct supersession", { status: "superseded" }, "statement.status"],
  ["origin typo", { origin: { kind: "infered", premises: ["missing"] } }, "statement.origin"],
  ["missing object alternative", { object: {} }, "statement.object"],
] as const) {
  test(`tidy rejects ${name} before publishing or consuming its pending source`, (t) => {
    const project = fixture(t);
    const note = run(
      project,
      ["record", "--work", "graph", "--source", "User agreement"],
      "A policy.",
    );
    const batch = run(project, ["tidy", "prepare"]);
    const result = invoke(project, ["tidy", "apply"], {
      snapshot: batch.snapshot,
      graph: { entities: [entity(note.ref)], statements: [statement(note.ref, overrides)] },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(field);
    expect(run(project, ["tidy", "status"]).revision).toBe(0);
    expect(
      run(project, ["recall", "--work", "graph"]).pending.map(({ ref }: { ref: string }) => ref),
    ).toStrictEqual([note.ref]);
    expect(run(project, ["graph", "--history"]).statements).toStrictEqual([]);
  });
}

test("tidy rejects malformed graph collections without consuming pending and permits a corrected retry", (t) => {
  const project = fixture(t);
  const note = run(
    project,
    ["record", "--work", "graph", "--source", "User agreement"],
    "A policy.",
  );
  const batch = run(project, ["tidy", "prepare"]);
  for (const graph of [null, [], { entities: null }, { statements: {} }, { retire: false }]) {
    const result = invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot, graph });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("graph");
  }
  expect(
    run(project, ["recall", "--work", "graph"]).pending.map(({ ref }: { ref: string }) => ref),
  ).toStrictEqual([note.ref]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    graph: { entities: [entity(note.ref)], statements: [statement(note.ref)] },
  });
  expect(run(project, ["recall", "--work", "graph"]).pending).toStrictEqual([]);
});

test("restored graph rejects missing required fields at the file boundary without rewriting history", (t) => {
  const project = fixture(t);
  const note = run(
    project,
    ["record", "--work", "graph", "--source", "User agreement"],
    "A policy.",
  );
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    graph: { entities: [entity(note.ref)], statements: [statement(note.ref)] },
  });
  const path = join(run(project, ["location"]).projectDirectory, "tidy.json");
  const original = JSON.parse(readFileSync(path, "utf8"));
  for (const field of ["status", "conditions"]) {
    const malformed = structuredClone(original);
    delete malformed.revisions[0].graph.statements[0][field];
    const content = JSON.stringify(malformed);
    writeFileSync(path, content);
    const result = invoke(project, ["graph"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`statement.${field}`);
    expect(readFileSync(path, "utf8")).toBe(content);
  }
  const malformed = structuredClone(original);
  delete malformed.revisions[0].graph.entities[0].aliases;
  writeFileSync(path, JSON.stringify(malformed));
  expect(invoke(project, ["graph", "--query", "policy"]).stderr).toContain("entity.aliases");
});

test("valid literals, metadata projection and all generated historical states survive restore", (t) => {
  const project = fixture(t);
  const first = run(
    project,
    ["record", "--work", "graph", "--source", "User agreement"],
    "A policy.",
  );
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    graph: {
      metadata: "caller only",
      entities: [{ ...entity(first.ref), metadata: "caller only" }],
      statements: [
        statement(first.ref, { metadata: "caller only" }),
        statement(first.ref, { id: "nullable", object: { value: null } }),
        statement(first.ref, { id: "tentative", status: "unresolved" }),
      ],
    },
  });
  const initial = run(project, ["graph"]);
  expect(
    initial.statements.find(({ id }: { id: string }) => id === "current").object,
  ).toStrictEqual({ value: false });
  expect(
    initial.statements.find(({ id }: { id: string }) => id === "nullable").object,
  ).toStrictEqual({ value: null });
  expect(JSON.stringify(initial)).not.toContain("caller only");
  const next = run(
    project,
    ["record", "--work", "graph", "--source", "New agreement"],
    "Retire one and replace another.",
  );
  const second = run(project, ["tidy", "prepare"]);
  const changes = {
    snapshot: second.snapshot,
    graph: {
      statements: [statement(next.ref, { id: "replacement", supersedes: ["nullable"] })],
      retire: [{ id: "current", reason: "No longer applies.", sources: [next.ref] }],
    },
  };
  const published = run(project, ["tidy", "apply"], changes);
  expect(run(project, ["tidy", "apply"], changes)).toStrictEqual(published);
  const history = run(project, ["graph", "--history"]);
  expect(
    Object.fromEntries(
      history.statements.map(({ id, status }: { id: string; status: string }) => [id, status]),
    ),
  ).toStrictEqual({
    current: "retired",
    nullable: "superseded",
    replacement: "active",
    tentative: "unresolved",
  });
  expect(run(project, ["graph"]).statements.map(({ id }: { id: string }) => id)).toStrictEqual([
    "replacement",
    "tentative",
  ]);
});
