import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, git, run } from "./testing.mjs";

function recordDaily(project, work, text, source, cwd = project.repo) {
  return run(project, ["record", "--work", work, "--source", source ?? text], text, cwd);
}

function graphEntity(id, source) {
  return { id, kind: "concept", name: id, sources: [source] };
}

function graphStatement(id, subject, object, scope, source, overrides = {}) {
  return {
    id,
    subject,
    predicate: "observes",
    object: { entity: object },
    text: `${subject} observes ${object}.`,
    scope,
    sources: [source],
    origin: { kind: "stated" },
    ...overrides,
  };
}

function scopedMemory(id, scope, text, source, overrides = {}) {
  return {
    id,
    scope,
    text,
    reason: "The current decision is supported by the cited observation.",
    sources: [source],
    ...overrides,
  };
}

function publish(project, graph, extra = {}, cwd = project.repo) {
  const batch = run(project, ["tidy", "prepare"], undefined, cwd);
  const result = run(
    project,
    ["tidy", "apply"],
    { snapshot: batch.snapshot, graph, ...extra },
    cwd,
  );
  return { batch, result };
}

test("a question-only client derives work scope from search before reading current recall and graph", (t) => {
  const project = fixture(t);
  const old = recordDaily(
    project,
    "storage-retrieval",
    "storage migration storage migration storage migration: the old cache proposal.",
    "Legacy storage migration evidence",
  );
  const current = recordDaily(
    project,
    "storage-retrieval",
    "The current storage migration decision uses a ledger.",
    "Accepted storage migration decision",
  );
  const search = run(project, ["search", "--query", "storage migration"]);
  expect(search.results[0].ref).toBe(old.ref);
  const candidateWork = search.results[0].scope.id;
  expect(candidateWork).toBe("storage-retrieval");

  const scope = { type: "work", id: candidateWork };
  publish(
    project,
    {
      entities: [graphEntity("storage-policy", current.ref), graphEntity("ledger", current.ref)],
      statements: [
        graphStatement("current-storage-policy", "storage-policy", "ledger", scope, current.ref, {
          text: "The current storage migration decision uses a ledger.",
        }),
      ],
    },
    {
      memories: [
        scopedMemory(
          "storage-policy",
          scope,
          "The current storage migration decision uses a ledger.",
          current.ref,
        ),
      ],
    },
  );

  const recalled = run(project, ["recall", "--work", candidateWork]);
  expect(recalled.memories.map(({ id }) => id)).toStrictEqual(["storage-policy"]);
  expect(recalled.memories[0].sources).toStrictEqual([current.ref]);
  const graph = run(project, ["graph", "--work", candidateWork]);
  expect(graph.statements.map(({ id }) => id)).toStrictEqual(["current-storage-policy"]);
  expect(graph.statements[0].scope).toStrictEqual(scope);
  expect(graph.sources.map(({ ref }) => ref)).toContain(current.ref);
});

test("same Git common-dir keeps contradictory worktree observations with version conditions and sources", (t) => {
  const project = fixture(t);
  const olderWorktree = join(project.root, "older-code");
  const newerWorktree = join(project.root, "newer-code");
  writeFileSync(join(project.repo, "parser.txt"), "accepts legacy tokens\n");
  git(project.repo, "add", "parser.txt");
  git(
    project.repo,
    "-c",
    "user.name=Loom Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "parser v1",
  );
  const olderCommit = git(project.repo, "rev-parse", "HEAD").trim();
  git(project.repo, "worktree", "add", "--quiet", "--detach", olderWorktree, "HEAD");
  writeFileSync(join(project.repo, "parser.txt"), "rejects legacy tokens\n");
  git(project.repo, "add", "parser.txt");
  git(
    project.repo,
    "-c",
    "user.name=Loom Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "parser v2",
  );
  const newerCommit = git(project.repo, "rev-parse", "HEAD").trim();
  git(project.repo, "worktree", "add", "--quiet", "--detach", newerWorktree, "HEAD");

  const olderLocation = run(project, ["location"], undefined, olderWorktree);
  const newerLocation = run(project, ["location"], undefined, newerWorktree);
  expect(olderLocation.project.id).toBe(newerLocation.project.id);
  expect(readFileSync(join(olderWorktree, "parser.txt"), "utf8")).toBe("accepts legacy tokens\n");
  expect(readFileSync(join(newerWorktree, "parser.txt"), "utf8")).toBe("rejects legacy tokens\n");

  const older = recordDaily(
    project,
    "parser-v1",
    "Parser accepts legacy tokens.",
    `code version ${olderCommit}`,
    olderWorktree,
  );
  const newer = recordDaily(
    project,
    "parser-v2",
    "Parser rejects legacy tokens.",
    `code version ${newerCommit}`,
    newerWorktree,
  );
  const olderScope = { type: "work", id: "parser-v1" };
  const newerScope = { type: "work", id: "parser-v2" };
  publish(project, {
    entities: [
      graphEntity("parser", older.ref),
      graphEntity("legacy-accepted", older.ref),
      graphEntity("legacy-rejected", newer.ref),
    ],
    statements: [
      graphStatement("parser-v1-observation", "parser", "legacy-accepted", olderScope, older.ref, {
        conditions: [`code version ${olderCommit}`],
      }),
      graphStatement("parser-v2-observation", "parser", "legacy-rejected", newerScope, newer.ref, {
        conditions: [`code version ${newerCommit}`],
      }),
    ],
  });

  const olderGraph = run(project, ["graph", "--work", "parser-v1"]);
  const newerGraph = run(project, ["graph", "--work", "parser-v2"]);
  expect(olderGraph.statements[0]).toMatchObject({
    id: "parser-v1-observation",
    scope: olderScope,
    conditions: [`code version ${olderCommit}`],
    sources: [older.ref],
  });
  expect(newerGraph.statements[0]).toMatchObject({
    id: "parser-v2-observation",
    scope: newerScope,
    conditions: [`code version ${newerCommit}`],
    sources: [newer.ref],
  });
  expect(run(project, ["graph", "--work", "parser-v1"]).statements).toHaveLength(1);
  expect(run(project, ["graph", "--work", "parser-v2"]).statements).toHaveLength(1);
});

test("a new decision remains pending until tidy replaces the adopted statement and old refs stay readable", (t) => {
  const project = fixture(t);
  const old = recordDaily(project, "storage", "Use a mutable ledger.", "Initial decision");
  const oldStatement = graphStatement(
    "storage-choice-v1",
    "storage",
    "mutable-ledger",
    { type: "work", id: "storage" },
    old.ref,
    { text: "Storage uses a mutable ledger." },
  );
  publish(project, {
    entities: [graphEntity("storage", old.ref), graphEntity("mutable-ledger", old.ref)],
    statements: [oldStatement],
  });

  const newDecision = recordDaily(
    project,
    "storage",
    "Use an append-only ledger instead.",
    "Replacement decision",
  );
  const beforeReplacement = run(project, ["recall", "--work", "storage"]);
  expect(beforeReplacement.pending.map(({ ref }) => ref)).toStrictEqual([newDecision.ref]);
  expect(run(project, ["graph", "--work", "storage"]).statements[0].id).toBe(oldStatement.id);
  const batch = run(project, ["tidy", "prepare"]);
  expect(batch.records.map(({ ref }) => ref)).toStrictEqual([newDecision.ref]);

  const newStatement = graphStatement(
    "storage-choice-v2",
    "storage",
    "append-only-ledger",
    { type: "work", id: "storage" },
    newDecision.ref,
    {
      text: "Storage uses an append-only ledger.",
      supersedes: [oldStatement.id],
    },
  );
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    graph: {
      entities: [graphEntity("append-only-ledger", newDecision.ref)],
      statements: [newStatement],
    },
  });

  const current = run(project, ["graph", "--work", "storage"]);
  expect(current.statements.map(({ id }) => id)).toStrictEqual([newStatement.id]);
  const history = run(project, ["graph", "--work", "storage", "--history"]);
  expect(history.statements.find(({ id }) => id === oldStatement.id)).toMatchObject({
    status: "superseded",
    supersededBy: [newStatement.id],
  });
  expect(run(project, ["read", "--ref", old.ref]).text).toBe(old.text);
  expect(run(project, ["recall", "--work", "storage"]).pending).toStrictEqual([]);
});
