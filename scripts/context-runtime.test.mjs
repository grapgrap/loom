import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("context.mjs", import.meta.url));
const launcher = fileURLToPath(new URL(process.platform === "win32" ? "context.cmd" : "context.sh",
  import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "loom-runtime-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  const emptyPath = join(root, "empty-bin");
  mkdirSync(repo);
  mkdirSync(emptyPath);
  execFileSync("git", ["-C", repo, "init", "--quiet"]);
  return { root, repo, emptyPath, directory: join(root, "records") };
}

function withoutExecutables(path) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
  return { ...env, PATH: path };
}

function launch(project, { env = process.env, args = ["location"], input } = {}) {
  const options = [launcher, ...args, "--cwd", project.repo, "--data-dir", project.directory];
  if (process.platform === "win32") {
    const command = options.map((value) => `"${value}"`).join(" ");
    return spawnSync(process.env.ComSpec || join(process.env.SystemRoot, "System32", "cmd.exe"),
      ["/d", "/s", "/c", `"${command}"`], { env, encoding: "utf8", input });
  }
  return spawnSync("/bin/sh", options, { env, encoding: "utf8", input });
}

test("missing Node is reported before mjs execution, and PATH repair allows retry", (t) => {
  const project = fixture(t);
  const missing = launch(project, { env: withoutExecutables(project.emptyPath) });
  assert.equal(missing.status, 2, missing.stderr);
  assert.match(missing.stderr, /LOOM_NODE_MISSING/);
  assert.match(missing.stderr, /agent.*retry/i);
  assert.equal(existsSync(project.directory), false);
  const repaired = launch(project);
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.equal(JSON.parse(repaired.stdout).dataDirectory, project.directory);
});

test("unsupported Node is reported by the launcher and by direct mjs invocation", (t) => {
  const project = fixture(t);
  const preload = join(project.root, "old-node.cjs");
  writeFileSync(preload, "Object.defineProperty(process.versions, 'node', { value: '18.20.0' });\n");
  const env = { ...process.env, NODE_OPTIONS: `--require="${preload}"` };
  const blocked = launch(project, { env });
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.match(blocked.stderr, /LOOM_NODE_UNSUPPORTED/);
  const direct = spawnSync(process.execPath, [script, "location", "--cwd", project.repo],
    { env, encoding: "utf8" });
  assert.equal(direct.status, 2, direct.stderr);
  assert.match(direct.stderr, /LOOM_NODE_UNSUPPORTED/);
  assert.equal(existsSync(project.directory), false);
});

test("missing Git has an actionable dependency error and can be retried after PATH repair", (t) => {
  const project = fixture(t);
  const args = [script, "location", "--cwd", project.repo, "--data-dir", project.directory];
  const missing = spawnSync(process.execPath, args,
    { env: withoutExecutables(project.emptyPath), encoding: "utf8" });
  assert.equal(missing.status, 2, missing.stderr);
  assert.match(missing.stderr, /LOOM_GIT_MISSING/);
  assert.match(missing.stderr, /agent.*retry/i);
  assert.equal(existsSync(project.directory), false);
  const repaired = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(repaired.status, 0, repaired.stderr);
});

test("a non-Git directory is not misreported as a missing Git installation", (t) => {
  const project = fixture(t);
  const result = spawnSync(process.execPath, [script, "location", "--cwd", project.root,
    "--data-dir", project.directory], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /LOOM_GIT_MISSING/);
  assert.match(result.stderr, /Cannot identify the Git repository/);
});

test("a Git executable with a missing runtime reports an environment failure", {
  skip: process.platform === "win32",
}, (t) => {
  const project = fixture(t);
  writeFileSync(join(project.emptyPath, "git"),
    "#!/bin/sh\nprintf '%s\\n' 'Git runtime is unavailable' >&2\nexit 1\n", { mode: 0o755 });
  const result = spawnSync(process.execPath, [script, "location", "--cwd", project.repo,
    "--data-dir", project.directory], { env: withoutExecutables(project.emptyPath), encoding: "utf8" });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /LOOM_GIT_UNUSABLE/);
  assert.match(result.stderr, /Git runtime is unavailable/);
  assert.equal(existsSync(project.directory), false);
});

test("the launcher forwards argument paths, stdin and the CLI's exit code", (t) => {
  const project = fixture(t);
  const saved = launch(project, { args: ["remember", "--id", "runtime-context"],
    input: JSON.stringify({ expectedRevision: 0, scope: { type: "project" },
      text: "Use the available runtime after checking its version.",
      reason: "Missing dependencies can be prepared by the agent.",
      source: { type: "user", reference: "Chat: prepare missing Node or Git and retry." } }) });
  assert.equal(saved.status, 0, saved.stderr);
  assert.equal(JSON.parse(saved.stdout).id, "runtime-context");
  const invalid = launch(project, { args: ["remember", "--id", "../outside"] });
  assert.equal(invalid.status, 1, invalid.stderr);
});
