import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cliPath = fileURLToPath(new URL("cli.mjs", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "loom-context-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet");
  git(repo, "-c", "user.name=Loom Test", "-c", "user.email=test@example.invalid",
    "commit", "--quiet", "--allow-empty", "-m", "fixture");
  return { root, repo, directory: join(root, "records") };
}

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function invoke(project, command, { args = [], input, cwd = project.repo } = {}) {
  return spawnSync(process.execPath,
    [cliPath, command, "--cwd", cwd, "--data-dir", project.directory, ...args],
    { encoding: "utf8", input: input === undefined ? undefined : JSON.stringify(input) });
}

function run(project, command, options) {
  const result = invoke(project, command, options);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
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
    evidence: ["node --test scripts/context/cli.test.mjs: storage checks passed"],
    next: ["Connect recall and checkpoint commands to work."],
    source: { type: "agent", reference: "Chat: observed CLI results." },
    ...overrides,
  };
}

test("location and empty recall do not create a store", (t) => {
  const project = fixture(t);
  const location = run(project, "location");
  assert.equal(location.dataDirectory, project.directory);
  assert.equal(location.project.kind, "git");
  assert.match(location.project.id, /^[a-f0-9]{64}$/);
  assert.deepEqual(run(project, "recall").memories, []);
  assert.deepEqual(run(project, "recall").works, []);
  assert.equal(existsSync(project.directory), false);
});

test("a memory survives worktree removal and is shared by the original checkout", (t) => {
  const project = fixture(t);
  const worktree = join(project.root, "worktree");
  git(project.repo, "worktree", "add", "--quiet", "--detach", worktree);
  const first = run(project, "location");
  const second = run(project, "location", { cwd: worktree });
  assert.equal(first.project.id, second.project.id);
  const saved = run(project, "remember", {
    cwd: worktree, args: ["--id", "context-location"], input: memory(),
  });
  git(project.repo, "worktree", "remove", worktree);
  const recalled = run(project, "recall").memories;
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].id, saved.id);
  assert.equal(recalled[0].text, memory().text);
  assert.deepEqual(recalled[0].source, memory().source);
});

test("separate clones and unrelated work scopes do not share memories", (t) => {
  const project = fixture(t);
  const clone = join(project.root, "clone");
  git(project.root, "clone", "--quiet", project.repo, clone);
  run(project, "remember", { args: ["--id", "shared"], input: memory() });
  run(project, "remember", {
    args: ["--id", "first-work"], input: memory({ scope: { type: "work", id: "first" } }),
  });
  run(project, "remember", {
    args: ["--id", "second-work"], input: memory({ scope: { type: "work", id: "second" } }),
  });
  assert.deepEqual(run(project, "recall").memories.map(({ id }) => id), ["shared"]);
  assert.deepEqual(run(project, "recall", { args: ["--work", "first"] }).memories
    .map(({ id }) => id).sort(), ["first-work", "shared"]);
  assert.deepEqual(run(project, "recall", { cwd: clone }).memories, []);
});

test("retries are idempotent and replacement needs the observed revision", (t) => {
  const project = fixture(t);
  const args = ["--id", "context-location"];
  const first = run(project, "remember", { args, input: memory() });
  assert.deepEqual(run(project, "remember", { args, input: memory() }), first);
  const replacement = memory({ expectedRevision: 1, text: "Use the Loom user data directory." });
  const second = run(project, "remember", { args, input: replacement });
  assert.equal(second.revision, 2);
  assert.deepEqual(run(project, "remember", { args, input: replacement }), second);
  const stale = invoke(project, "remember", {
    args, input: memory({ expectedRevision: 1, text: "Use a Git-tracked document." }),
  });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /revision.*2/i);
  const current = run(project, "recall").memories[0];
  assert.equal(current.text, replacement.text);
  assert.equal(Object.hasOwn(current, "history"), false);
  const history = run(project, "recall", { args: ["--history"] }).memories[0].history;
  assert.equal(history.length, 1);
  assert.equal(history[0].text, first.text);
  assert.deepEqual(run(project, "recall", { args: ["--query", "Git-tracked"] }).memories, []);
});

test("checkpoint recall requires a work ID and stale updates leave progress intact", (t) => {
  const project = fixture(t);
  const args = ["--work", "context-cli"];
  const first = run(project, "checkpoint", { args, input: checkpoint() });
  assert.deepEqual(run(project, "checkpoint", { args, input: checkpoint() }), first);
  const recalled = run(project, "recall");
  assert.equal(recalled.work, null);
  assert.equal(recalled.works[0].id, "context-cli");
  assert.equal(recalled.works[0].revision, 1);
  assert.deepEqual(run(project, "recall", { args }).work.evidence, checkpoint().evidence);
  const completed = checkpoint({ expectedRevision: 1, status: "complete", next: [],
    progress: "Storage and skill integration have been verified." });
  run(project, "checkpoint", { args, input: completed });
  const stale = invoke(project, "checkpoint", {
    args, input: checkpoint({ expectedRevision: 1, progress: "Old view of the work." }),
  });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /revision.*2/i);
  assert.equal(run(project, "recall", { args }).work.status, "complete");
});

test("forget removes every revision and an old create request cannot revive it", (t) => {
  const project = fixture(t);
  const args = ["--id", "context-location"];
  run(project, "remember", { args, input: memory() });
  run(project, "remember", { args, input: memory({ expectedRevision: 1, text: "New location." }) });
  const stale = invoke(project, "forget", { args: [...args, "--revision", "1"] });
  assert.equal(stale.status, 1);
  const forgotten = run(project, "forget", { args: [...args, "--revision", "2"] });
  assert.equal(forgotten.forgotten, true);
  assert.deepEqual(run(project, "forget", { args: [...args, "--revision", "2"] }), forgotten);
  assert.deepEqual(run(project, "recall", { args: ["--history"] }).memories, []);
  const location = run(project, "location");
  const contents = readFileSync(join(location.projectDirectory, "context", "context-location.json"), "utf8");
  assert.equal(contents.includes(memory().text), false);
  assert.equal(contents.includes("New location."), false);
  assert.equal(invoke(project, "remember", { args, input: memory() }).status, 1);
});

test("input parsing uses known fields without enforcing a closed object schema", (t) => {
  const project = fixture(t);
  const savedMemory = run(project, "remember", {
    args: ["--id", "location"], input: memory({ metadata: "Caller-only metadata." }),
  });
  assert.equal(savedMemory.text, memory().text);
  assert.equal(Object.hasOwn(savedMemory, "metadata"), false);
  const savedCheckpoint = run(project, "checkpoint", {
    args: ["--work", "storage"], input: checkpoint({ metadata: "Caller-only metadata." }),
  });
  assert.equal(savedCheckpoint.progress, checkpoint().progress);
  assert.equal(Object.hasOwn(savedCheckpoint, "metadata"), false);
  assert.equal(run(project, "recall").memories[0].text, memory().text);
  assert.equal(run(project, "recall", { args: ["--work", "storage"] }).work.progress, checkpoint().progress);
});

test("invalid values, path traversal, scope changes and incomplete completion are rejected", (t) => {
  const project = fixture(t);
  for (const id of ["../other-project", "CON", "a/b", ""]) {
    assert.equal(invoke(project, "remember", { args: ["--id", id], input: memory() }).status, 1);
  }
  for (const input of [memory({ source: { type: "user", reference: "" } }),
    memory({ expectedRevision: -1 }), memory({ text: " " }), memory({ reason: "" })]) {
    assert.equal(invoke(project, "remember", { args: ["--id", "bad"], input }).status, 1);
  }
  assert.equal(existsSync(project.directory), false);
  run(project, "remember", { args: ["--id", "fixed-scope"], input: memory() });
  const moved = invoke(project, "remember", { args: ["--id", "fixed-scope"],
    input: memory({ expectedRevision: 1, scope: { type: "work", id: "different" } }) });
  assert.equal(moved.status, 1);
  assert.equal(invoke(project, "checkpoint", { args: ["--work", "unfinished"],
    input: checkpoint({ status: "complete", evidence: [], next: [] }) }).status, 1);
  assert.equal(invoke(project, "checkpoint", { args: ["--work", "unfinished"],
    input: checkpoint({ status: "complete" }) }).status, 1);
});

test("corrupt or future-version records fail visibly and are not overwritten", (t) => {
  const project = fixture(t);
  run(project, "remember", { args: ["--id", "context-location"], input: memory() });
  const location = run(project, "location");
  const path = join(location.projectDirectory, "context", "context-location.json");
  for (const broken of ["{broken", JSON.stringify({ version: 999 })]) {
    writeFileSync(path, broken);
    const recalled = invoke(project, "recall");
    assert.equal(recalled.status, 1);
    assert.ok(recalled.stderr.includes(path));
    assert.equal(invoke(project, "remember", {
      args: ["--id", "context-location"], input: memory(),
    }).status, 1);
    assert.equal(readFileSync(path, "utf8"), broken);
  }
});

test("a CLI launched from the checkout reads JSON files and paths containing spaces", (t) => {
  const project = fixture(t);
  const directory = join(project.root, "Application Support", "loom");
  const input = join(project.root, "memory input.json");
  const submitted = memory({ text: "다른 워크트리에서 합의된 맥락을 다시 읽는다." });
  writeFileSync(input, JSON.stringify(submitted));
  const stored = spawnSync(process.execPath, [cliPath, "remember", "--data-dir", directory,
    "--id", "shared-context", "--input", input], { cwd: project.repo, encoding: "utf8" });
  assert.equal(stored.status, 0, stored.stderr);
  assert.equal(JSON.parse(stored.stdout).text, submitted.text);
  const recalled = spawnSync(process.execPath, [cliPath, "recall"], { cwd: project.repo,
    encoding: "utf8", env: { ...process.env, LOOM_DATA_DIR: directory } });
  assert.equal(recalled.status, 0, recalled.stderr);
  assert.equal(JSON.parse(recalled.stdout).memories[0].text, submitted.text);
});

test("an abandoned write lock reports failure without changing the record", (t) => {
  const project = fixture(t);
  run(project, "remember", { args: ["--id", "context-location"], input: memory() });
  const location = run(project, "location");
  const path = join(location.projectDirectory, "context", "context-location.json");
  const previous = readFileSync(path, "utf8");
  const lockPath = `${path}.lock`;
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid }));
  const blocked = invoke(project, "remember", { args: ["--id", "context-location"],
    input: memory({ expectedRevision: 1, text: "A replacement blocked by the lock." }) });
  assert.equal(blocked.status, 1);
  assert.ok(blocked.stderr.includes(lockPath));
  assert.equal(readFileSync(path, "utf8"), previous);
  assert.equal(existsSync(lockPath), true);
  rmSync(lockPath);
  assert.equal(run(project, "remember", { args: ["--id", "context-location"],
    input: memory({ expectedRevision: 1, text: "Replacement after checking the writer." }) }).revision, 2);
});

function invokeConcurrent(project, command, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath,
      [cliPath, command, "--cwd", project.repo, "--data-dir", project.directory, ...options.args]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(JSON.stringify(options.input));
  });
}

test("concurrent agents keep independent records and conflicting revisions have one winner", async (t) => {
  const project = fixture(t);
  const writes = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    invokeConcurrent(project, "remember", { args: ["--id", `choice-${i}`], input: memory() })));
  for (const result of writes) assert.equal(result.status, 0, result.stderr);
  assert.equal(run(project, "recall").memories.length, 8);
  const conflicting = await Promise.all(["First replacement.", "Second replacement."].map((text) =>
    invokeConcurrent(project, "remember", { args: ["--id", "choice-0"],
      input: memory({ expectedRevision: 1, text }) })));
  assert.deepEqual(conflicting.map(({ status }) => status).sort(), [0, 1]);
  const current = run(project, "recall", { args: ["--query", "replacement"] }).memories[0];
  assert.equal(current.revision, 2);
  assert.equal(run(project, "recall", { args: ["--history", "--query", "replacement"] })
    .memories[0].history.length, 1);
});
