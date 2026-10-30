import { expect, test } from "vitest";
import { fixture, invoke, run } from "./testing.mjs";

test("default recall keeps resumable context while full recall adds work discovery and graph evidence", (t) => {
  const project = fixture(t);
  const source = run(
    project,
    ["record", "--work", "storage", "--source", "Accepted storage decision"],
    "Storage uses a ledger.",
  );
  run(project, ["checkpoint", "--work", "storage"], {
    expectedRevision: 0,
    goal: "Implement ledger storage.",
    status: "active",
    progress: "Storage policy agreed.",
    evidence: [],
    next: ["Implement the agreed policy."],
    source: { type: "user", reference: source.ref },
  });
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [
      {
        id: "storage-policy",
        scope: { type: "work", id: "storage" },
        text: source.text,
        reason: "Preserve the accepted policy.",
        sources: [source.ref],
      },
    ],
    graph: {
      entities: [{ id: "storage", kind: "module", name: "Storage", sources: [source.ref] }],
      statements: [
        {
          id: "uses-ledger",
          subject: "storage",
          predicate: "uses",
          object: { value: "ledger" },
          text: source.text,
          scope: { type: "work", id: "storage" },
          sources: [source.ref],
          origin: { kind: "stated" },
        },
      ],
    },
  });
  const pending = run(
    project,
    ["record", "--work", "storage", "--source", "New implementation constraint"],
    "Preserve atomic writes.",
  );

  const compact = run(project, ["recall", "--work", "storage"]);
  expect(compact).not.toHaveProperty("works");
  expect(compact).not.toHaveProperty("worksRemaining");
  expect(compact).not.toHaveProperty("graph");
  expect(compact.memories.map(({ id }) => id)).toStrictEqual(["storage-policy"]);
  expect(compact.work.next).toStrictEqual(["Implement the agreed policy."]);
  expect(compact.unfinishedWorks.map(({ id }) => id)).toStrictEqual(["storage"]);
  expect(compact.unreviewedWorks.map(({ id }) => id)).toStrictEqual(["storage"]);
  expect(compact.pending.map(({ ref }) => ref)).toStrictEqual([pending.ref]);

  const full = run(project, ["recall", "--work", "storage", "--full"]);
  const { works, worksRemaining, graph, ...context } = full;
  expect(context).toStrictEqual(compact);
  expect(works.map(({ id }) => id)).toStrictEqual(["storage"]);
  expect(worksRemaining).toBe(0);
  expect(graph).toStrictEqual(run(project, ["graph", "--work", "storage"]));
  expect(graph.statements.map(({ id }) => id)).toStrictEqual(["uses-ledger"]);
  expect(run(project, ["search", "--query", "Storage ledger"]).results[0].scope.id).toBe("storage");
  expect(run(project, ["read", "--ref", source.ref]).text).toBe(source.text);
});

test("recall graph selectors require full output instead of silently hiding their results", (t) => {
  const project = fixture(t);
  for (const selector of [
    ["--entity", "storage"],
    ["--depth", "1"],
  ]) {
    const result = invoke(project, ["recall", ...selector]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("require --full");
    expect(run(project, ["recall", "--full", ...selector]).graph.statements).toStrictEqual([]);
  }
});
