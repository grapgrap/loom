import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

import { fixture, git, invoke as invokeCli, run as runCli, concurrentRequest } from "./testing.mjs";

const cliPath = fileURLToPath(new URL("cli.mjs", import.meta.url));

function invoke(project, command, { args = [], input, cwd } = {}) {
  return invokeCli(project, [command, ...args], input, cwd);
}

function run(project, command, { args = [], input, cwd } = {}) {
  return runCli(project, [command, ...args], input, cwd);
}

function memory(overrides = {}) {
  return {
    expectedRevision: 0,
    scope: { type: "project" },
    text: "Store agent context outside Git checkouts.",
    reason: "Worktrees can be removed while the project continues.",
    source: { type: "user", reference: "Chat: user agreed to keep context outside Git." },
    ...overrides,
  };
}

function checkpoint(overrides = {}) {
  return {
    expectedRevision: 0,
    goal: "Add context recall to Loom.",
    status: "active",
    progress: "Storage behavior has been verified; skill integration remains.",
    evidence: ["yarn test scripts/context/cli.test.mjs: storage checks passed"],
    next: ["Connect recall and checkpoint commands to work."],
    source: { type: "agent", reference: "Chat: observed CLI results." },
    ...overrides,
  };
}

test("location and empty recall do not create a store", (t) => {
  const project = fixture(t);
  const location = run(project, "location");
  expect(location.dataDirectory).toBe(project.directory);
  expect(location.project.kind).toBe("git");
  expect(location.project.id).toMatch(/^[a-f0-9]{64}$/);
  expect(run(project, "recall").memories).toStrictEqual([]);
  expect(run(project, "recall")).not.toHaveProperty("works");
  expect(run(project, "recall", { args: ["--full"] }).works).toStrictEqual([]);
  expect(existsSync(project.directory)).toBe(false);
});

test("a memory survives worktree removal and is shared by the original checkout", (t) => {
  const project = fixture(t);
  const worktree = join(project.root, "worktree");
  git(project.repo, "worktree", "add", "--quiet", "--detach", worktree);
  const first = run(project, "location");
  const second = run(project, "location", { cwd: worktree });
  expect(first.project.id).toBe(second.project.id);
  const saved = run(project, "remember", {
    cwd: worktree,
    args: ["--id", "context-location"],
    input: memory(),
  });
  git(project.repo, "worktree", "remove", worktree);
  const recalled = run(project, "recall").memories;
  expect(recalled.length).toBe(1);
  expect(recalled[0].id).toBe(saved.id);
  expect(recalled[0].text).toBe(memory().text);
  expect(recalled[0].source).toStrictEqual(memory().source);
});

test("separate clones and unrelated work scopes do not share memories", (t) => {
  const project = fixture(t);
  const clone = join(project.root, "clone");
  git(project.root, "clone", "--quiet", project.repo, clone);
  run(project, "remember", { args: ["--id", "shared"], input: memory() });
  run(project, "remember", {
    args: ["--id", "first-work"],
    input: memory({ scope: { type: "work", id: "first" } }),
  });
  run(project, "remember", {
    args: ["--id", "second-work"],
    input: memory({ scope: { type: "work", id: "second" } }),
  });
  expect(run(project, "recall").memories.map(({ id }) => id)).toStrictEqual(["shared"]);
  expect(
    run(project, "recall", { args: ["--work", "first"] })
      .memories.map(({ id }) => id)
      .sort(),
  ).toStrictEqual(["first-work", "shared"]);
  expect(run(project, "recall", { cwd: clone }).memories).toStrictEqual([]);
});

test("retries are idempotent and replacement needs the observed revision", (t) => {
  const project = fixture(t);
  const args = ["--id", "context-location"];
  const first = run(project, "remember", { args, input: memory() });
  expect(run(project, "remember", { args, input: memory() })).toStrictEqual(first);
  const replacement = memory({ expectedRevision: 1, text: "Use the Loom user data directory." });
  const second = run(project, "remember", { args, input: replacement });
  expect(second.revision).toBe(2);
  expect(run(project, "remember", { args, input: replacement })).toStrictEqual(second);
  const stale = invoke(project, "remember", {
    args,
    input: memory({ expectedRevision: 1, text: "Use a Git-tracked document." }),
  });
  expect(stale.status).toBe(1);
  expect(stale.stderr).toMatch(/revision.*2/i);
  const current = run(project, "recall").memories[0];
  expect(current.text).toBe(replacement.text);
  expect(Object.hasOwn(current, "history")).toBe(false);
  const history = run(project, "recall", { args: ["--history"] }).memories[0].history;
  expect(history.length).toBe(1);
  expect(history[0].text).toBe(first.text);
  expect(run(project, "recall", { args: ["--query", "Git-tracked"] }).memories).toStrictEqual([]);
});

test("checkpoint recall requires a work ID and stale updates leave progress intact", (t) => {
  const project = fixture(t);
  const args = ["--work", "context-cli"];
  const first = run(project, "checkpoint", { args, input: checkpoint() });
  expect(run(project, "checkpoint", { args, input: checkpoint() })).toStrictEqual(first);
  const recalled = run(project, "recall", { args: ["--full"] });
  expect(recalled.work).toBe(null);
  expect(recalled.works[0].id).toBe("context-cli");
  expect(recalled.works[0].revision).toBe(1);
  expect(run(project, "recall", { args }).work.evidence).toStrictEqual(checkpoint().evidence);
  const completed = checkpoint({
    expectedRevision: 1,
    status: "complete",
    next: [],
    progress: "Storage and skill integration have been verified.",
  });
  run(project, "checkpoint", { args, input: completed });
  const stale = invoke(project, "checkpoint", {
    args,
    input: checkpoint({ expectedRevision: 1, progress: "Old view of the work." }),
  });
  expect(stale.status).toBe(1);
  expect(stale.stderr).toMatch(/revision.*2/i);
  expect(run(project, "recall", { args }).work.status).toBe("complete");
});

test("forget removes every revision and an old create request cannot revive it", (t) => {
  const project = fixture(t);
  const args = ["--id", "context-location"];
  run(project, "remember", { args, input: memory() });
  run(project, "remember", { args, input: memory({ expectedRevision: 1, text: "New location." }) });
  const stale = invoke(project, "forget", { args: [...args, "--revision", "1"] });
  expect(stale.status).toBe(1);
  const forgotten = run(project, "forget", { args: [...args, "--revision", "2"] });
  expect(forgotten.forgotten).toBe(true);
  expect(run(project, "forget", { args: [...args, "--revision", "2"] })).toStrictEqual(forgotten);
  expect(run(project, "recall", { args: ["--history"] }).memories).toStrictEqual([]);
  const location = run(project, "location");
  const contents = readFileSync(
    join(location.projectDirectory, "context", "context-location.json"),
    "utf8",
  );
  expect(contents.includes(memory().text)).toBe(false);
  expect(contents.includes("New location.")).toBe(false);
  expect(invoke(project, "remember", { args, input: memory() }).status).toBe(1);
});

test("input parsing uses known fields without enforcing a closed object schema", (t) => {
  const project = fixture(t);
  const savedMemory = run(project, "remember", {
    args: ["--id", "location"],
    input: memory({ metadata: "Caller-only metadata." }),
  });
  expect(savedMemory.text).toBe(memory().text);
  expect(Object.hasOwn(savedMemory, "metadata")).toBe(false);
  const savedCheckpoint = run(project, "checkpoint", {
    args: ["--work", "storage"],
    input: checkpoint({ metadata: "Caller-only metadata." }),
  });
  expect(savedCheckpoint.progress).toBe(checkpoint().progress);
  expect(Object.hasOwn(savedCheckpoint, "metadata")).toBe(false);
  expect(run(project, "recall").memories[0].text).toBe(memory().text);
  expect(run(project, "recall", { args: ["--work", "storage"] }).work.progress).toBe(
    checkpoint().progress,
  );
});

test("invalid values, path traversal, scope changes and incomplete completion are rejected", (t) => {
  const project = fixture(t);
  for (const id of ["../other-project", "CON", "a/b", ""]) {
    expect(invoke(project, "remember", { args: ["--id", id], input: memory() }).status).toBe(1);
  }
  for (const input of [
    memory({ source: { type: "user", reference: "" } }),
    memory({ expectedRevision: -1 }),
    memory({ text: " " }),
    memory({ reason: "" }),
  ]) {
    expect(invoke(project, "remember", { args: ["--id", "bad"], input }).status).toBe(1);
  }
  expect(existsSync(project.directory)).toBe(false);
  run(project, "remember", { args: ["--id", "fixed-scope"], input: memory() });
  const moved = invoke(project, "remember", {
    args: ["--id", "fixed-scope"],
    input: memory({ expectedRevision: 1, scope: { type: "work", id: "different" } }),
  });
  expect(moved.status).toBe(1);
  expect(
    invoke(project, "checkpoint", {
      args: ["--work", "unfinished"],
      input: checkpoint({ status: "complete", evidence: [], next: [] }),
    }).status,
  ).toBe(1);
  expect(
    invoke(project, "checkpoint", {
      args: ["--work", "unfinished"],
      input: checkpoint({ status: "complete" }),
    }).status,
  ).toBe(1);
});

test("corrupt or future-version records fail visibly and are not overwritten", (t) => {
  const project = fixture(t);
  run(project, "remember", { args: ["--id", "context-location"], input: memory() });
  const location = run(project, "location");
  const path = join(location.projectDirectory, "context", "context-location.json");
  for (const broken of ["{broken", JSON.stringify({ version: 999 })]) {
    writeFileSync(path, broken);
    const recalled = invoke(project, "recall");
    expect(recalled.status).toBe(1);
    expect(recalled.stderr.includes(path)).toBeTruthy();
    expect(
      invoke(project, "remember", {
        args: ["--id", "context-location"],
        input: memory(),
      }).status,
    ).toBe(1);
    expect(readFileSync(path, "utf8")).toBe(broken);
  }
});

test("a CLI launched from the checkout reads JSON files and paths containing spaces", (t) => {
  const project = fixture(t);
  const directory = join(project.root, "Application Support", "loom");
  const input = join(project.root, "memory input.json");
  const submitted = memory({ text: "다른 워크트리에서 합의된 맥락을 다시 읽는다." });
  writeFileSync(input, JSON.stringify(submitted));
  const stored = spawnSync(
    process.execPath,
    [cliPath, "remember", "--data-dir", directory, "--id", "shared-context", "--input", input],
    { cwd: project.repo, encoding: "utf8" },
  );
  expect(stored.status, stored.stderr).toBe(0);
  expect(JSON.parse(stored.stdout).text).toBe(submitted.text);
  const recalled = spawnSync(process.execPath, [cliPath, "recall"], {
    cwd: project.repo,
    encoding: "utf8",
    env: { ...process.env, LOOM_DATA_DIR: directory },
  });
  expect(recalled.status, recalled.stderr).toBe(0);
  expect(JSON.parse(recalled.stdout).memories[0].text).toBe(submitted.text);
});

// The CLI waits five seconds before rejecting an abandoned lock.
test(
  "an abandoned write lock reports failure without changing the record",
  { timeout: 10000 },
  (t) => {
    const project = fixture(t);
    run(project, "remember", { args: ["--id", "context-location"], input: memory() });
    const location = run(project, "location");
    const path = join(location.projectDirectory, "context", "context-location.json");
    const previous = readFileSync(path, "utf8");
    const lockPath = `${path}.lock`;
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid }));
    const blocked = invoke(project, "remember", {
      args: ["--id", "context-location"],
      input: memory({ expectedRevision: 1, text: "A replacement blocked by the lock." }),
    });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr.includes(lockPath)).toBeTruthy();
    expect(readFileSync(path, "utf8")).toBe(previous);
    expect(existsSync(lockPath)).toBe(true);
    rmSync(lockPath);
    expect(
      run(project, "remember", {
        args: ["--id", "context-location"],
        input: memory({ expectedRevision: 1, text: "Replacement after checking the writer." }),
      }).revision,
    ).toBe(2);
  },
);

function invokeConcurrent(project, command, { args, input }) {
  return concurrentRequest(project, [command, ...args], input);
}

test("concurrent agents keep independent records and conflicting revisions have one winner", async (t) => {
  const project = fixture(t);
  const writes = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      invokeConcurrent(project, "remember", { args: ["--id", `choice-${i}`], input: memory() }),
    ),
  );
  for (const result of writes) expect(result.status, result.stderr).toBe(0);
  expect(run(project, "recall").memories.length).toBe(8);
  const conflicting = await Promise.all(
    ["First replacement.", "Second replacement."].map((text) =>
      invokeConcurrent(project, "remember", {
        args: ["--id", "choice-0"],
        input: memory({ expectedRevision: 1, text }),
      }),
    ),
  );
  expect(conflicting.map(({ status }) => status).sort()).toStrictEqual([0, 1]);
  const current = run(project, "recall", { args: ["--query", "replacement"] }).memories[0];
  expect(current.revision).toBe(2);
  expect(
    run(project, "recall", { args: ["--history", "--query", "replacement"] }).memories[0].history
      .length,
  ).toBe(1);
});
