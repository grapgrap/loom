import type { Graph } from "./model.ts";
import { expect, test } from "vitest";
import { parseGraphChanges, validateGraph } from "./graph.ts";

const source = "note:graph@1";
const entity = { id: "policy", kind: "concept", name: "Policy", sources: [source] };
const statement = {
  id: "current",
  subject: entity.id,
  predicate: "enabled",
  object: { value: false },
  text: "The policy is disabled.",
  scope: { type: "project" },
  sources: [source],
  origin: { kind: "stated" },
};

for (const status of ["actve", "retired", "superseded", null, false]) {
  test(`new statement rejects status ${String(status)}`, () => {
    expect(() => parseGraphChanges({ statements: [{ ...statement, status }] })).toThrowError(
      /statement.status/,
    );
  });
}

for (const [overrides, field] of [
  [{ origin: { kind: "infered", premises: ["missing"] } }, "statement.origin.kind"],
  [{ origin: {} }, "statement.origin.kind"],
  [{ origin: null }, "statement.origin"],
  [{ origin: { kind: "inferred", premises: "current" } }, "premise IDs"],
  [{ origin: { kind: "inferred", premises: [] } }, "premises"],
  [{ object: {} }, "statement.object"],
  [{ object: { value: undefined } }, "statement.object"],
  [{ object: null }, "statement.object"],
  [{ object: [] }, "statement.object"],
  [{ object: "policy" }, "statement.object"],
  [{ conditions: "ready" }, "statement.conditions"],
  [{ supersedes: {} }, "superseded statement IDs"],
  [{ contradicts: null }, "contradicted statement IDs"],
  [{ validFrom: 0 }, "statement.validFrom"],
  [{ validUntil: false }, "statement.validUntil"],
] as const) {
  test(`new statement identifies invalid ${field}: ${JSON.stringify(overrides)}`, () => {
    expect(() => parseGraphChanges({ statements: [{ ...statement, ...overrides }] })).toThrowError(
      expect.objectContaining({ message: expect.stringContaining(field) }),
    );
  });
}

for (const [input, field] of [
  [null, "graph"],
  [[], "graph"],
  [false, "graph"],
  [{ entities: {} }, "graph.entities"],
  [{ entities: null }, "graph.entities"],
  [{ statements: "current" }, "graph.statements"],
  [{ statements: null }, "graph.statements"],
  [{ retire: false }, "graph.retire"],
  [{ retire: null }, "graph.retire"],
  [{ entities: [null] }, "entity"],
  [{ entities: [{ ...entity, aliases: "policy" }] }, "entity.aliases"],
  [{ statements: [null] }, "statement"],
  [{ retire: [null] }, "statement retirement"],
] as const) {
  test(`graph changes identify malformed ${field}: ${JSON.stringify(input)}`, () => {
    expect(() => parseGraphChanges(input)).toThrowError(
      expect.objectContaining({ message: expect.stringContaining(field) }),
    );
  });
}

test("new graph values preserve false/null literals and project open metadata", () => {
  const parsed = parseGraphChanges({
    metadata: "caller metadata",
    entities: [{ ...entity, metadata: "caller metadata" }],
    statements: [
      { ...statement, metadata: "caller metadata" },
      { ...statement, id: "unknown", object: { value: null }, status: "unresolved" },
      { ...statement, id: "entity-object", object: { entity: entity.id, value: 42 } },
    ],
  });
  expect(parsed.entities[0].aliases).toStrictEqual([]);
  expect(parsed.statements[0]).toMatchObject({ object: { value: false }, status: "active" });
  expect(parsed.statements[1]).toMatchObject({ object: { value: null }, status: "unresolved" });
  expect(parsed.statements[2].object).toStrictEqual({ entity: entity.id });
  expect(parsed).not.toHaveProperty("metadata");
  expect(parsed.entities[0]).not.toHaveProperty("metadata");
  expect(parsed.statements[0]).not.toHaveProperty("metadata");
});

function storedGraph(): Graph {
  const parsed = parseGraphChanges({ entities: [entity], statements: [statement] });
  return { entities: parsed.entities, statements: parsed.statements };
}

for (const [field, value] of [
  ["status", undefined],
  ["status", "actve"],
  ["supersedes", undefined],
  ["contradicts", undefined],
  ["conditions", undefined],
  ["origin", { kind: "infered" }],
  ["object", {}],
  ["reviewNeeded", "current"],
  ["supersededBy", false],
  ["retirement", false],
] as const) {
  test(`stored statement rejects invalid ${field} without accepting a defaulted copy`, () => {
    const graph = storedGraph();
    const input = { ...graph, statements: [{ ...graph.statements[0], [field]: value }] };
    expect(() => validateGraph(input as Graph)).toThrowError();
  });
}

test("stored graph requires its actual collections and entity aliases", () => {
  const graph = storedGraph();
  for (const input of [
    {},
    { entities: graph.entities, statements: null },
    { ...graph, entities: [entity] },
  ]) {
    expect(() => validateGraph(input as Graph)).toThrowError();
  }
});

test("stored graph accepts generated retired/superseded history and inference metadata", () => {
  const graph = storedGraph();
  graph.statements.push(
    {
      ...graph.statements[0],
      id: "retired",
      status: "retired",
      retirement: { reason: "No longer applies.", sources: [source] },
    },
    { ...graph.statements[0], id: "old", status: "superseded", supersededBy: ["current"] },
    {
      ...graph.statements[0],
      id: "derived",
      status: "unresolved",
      origin: { kind: "inferred", premises: ["retired"] },
      reviewNeeded: ["retired"],
    },
  );
  expect(() => validateGraph(graph)).not.toThrow();
});
