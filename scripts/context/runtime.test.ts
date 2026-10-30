import type { TestContext } from "vitest";
import type { Fixture } from "./testing.ts";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const cliPath = fileURLToPath(new URL("cli.ts", import.meta.url));
const launcherPath = fileURLToPath(
  new URL(process.platform === "win32" ? "cli.cmd" : "cli.sh", import.meta.url),
);

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "loom-runtime-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  const emptyPath = join(root, "empty-bin");
  mkdirSync(repo);
  mkdirSync(emptyPath);
  execFileSync("git", ["-C", repo, "init", "--quiet"]);
  return { root, repo, emptyPath, directory: join(root, "records") };
}

function withoutExecutables(path: string) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
  return { ...env, PATH: path };
}

function launch(
  project: Fixture,
  {
    env = process.env,
    args = ["location"],
    input,
  }: { env?: NodeJS.ProcessEnv; args?: string[]; input?: string } = {},
) {
  const options = [launcherPath, ...args, "--cwd", project.repo, "--data-dir", project.directory];
  if (process.platform === "win32") {
    const command = options.map((value) => `"${value}"`).join(" ");
    return spawnSync(
      process.env.ComSpec || join(process.env.SystemRoot!, "System32", "cmd.exe"),
      ["/d", "/s", "/c", `"${command}"`],
      { env, encoding: "utf8", input },
    );
  }
  return spawnSync("/bin/sh", options, { env, encoding: "utf8", input });
}

test("missing Node is reported before TypeScript execution, and PATH repair allows retry", (t) => {
  const project = fixture(t);
  const missing = launch(project, { env: withoutExecutables(project.emptyPath) });
  expect(missing.status, missing.stderr).toBe(2);
  expect(missing.stderr).toMatch(/LOOM_NODE_MISSING/);
  expect(missing.stderr).toMatch(/agent.*retry/i);
  expect(existsSync(project.directory)).toBe(false);
  const repaired = launch(project);
  expect(repaired.status, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).dataDirectory).toBe(project.directory);
});

test("unsupported Node is reported by the launcher and by direct TypeScript invocation", (t) => {
  const project = fixture(t);
  const preload = join(project.root, "old-node.cjs");
  writeFileSync(
    preload,
    "Object.defineProperty(process.versions, 'node', { value: '18.20.0' });\n",
  );
  const env = { ...process.env, NODE_OPTIONS: `--require="${preload}"` };
  const blocked = launch(project, { env });
  expect(blocked.status, blocked.stderr).toBe(2);
  expect(blocked.stderr).toMatch(/LOOM_NODE_UNSUPPORTED/);
  const direct = spawnSync(process.execPath, [cliPath, "location", "--cwd", project.repo], {
    env,
    encoding: "utf8",
  });
  expect(direct.status, direct.stderr).toBe(2);
  expect(direct.stderr).toMatch(/LOOM_NODE_UNSUPPORTED/);
  expect(existsSync(project.directory)).toBe(false);
});

test("missing Git has an actionable dependency error and can be retried after PATH repair", (t) => {
  const project = fixture(t);
  const args = [cliPath, "location", "--cwd", project.repo, "--data-dir", project.directory];
  const missing = spawnSync(process.execPath, args, {
    env: withoutExecutables(project.emptyPath),
    encoding: "utf8",
  });
  expect(missing.status, missing.stderr).toBe(2);
  expect(missing.stderr).toMatch(/LOOM_GIT_MISSING/);
  expect(missing.stderr).toMatch(/agent.*retry/i);
  expect(existsSync(project.directory)).toBe(false);
  const repaired = spawnSync(process.execPath, args, { encoding: "utf8" });
  expect(repaired.status, repaired.stderr).toBe(0);
});

test("a non-Git directory is not misreported as a missing Git installation", (t) => {
  const project = fixture(t);
  const result = spawnSync(
    process.execPath,
    [cliPath, "location", "--cwd", project.root, "--data-dir", project.directory],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).not.toMatch(/LOOM_GIT_MISSING/);
  expect(result.stderr).toMatch(/Cannot identify the Git repository/);
});

test(
  "a Git executable with a missing runtime reports an environment failure",
  {
    skip: process.platform === "win32",
  },
  (t) => {
    const project = fixture(t);
    writeFileSync(
      join(project.emptyPath, "git"),
      "#!/bin/sh\nprintf '%s\\n' 'Git runtime is unavailable' >&2\nexit 1\n",
      { mode: 0o755 },
    );
    const result = spawnSync(
      process.execPath,
      [cliPath, "location", "--cwd", project.repo, "--data-dir", project.directory],
      { env: withoutExecutables(project.emptyPath), encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toMatch(/LOOM_GIT_UNUSABLE/);
    expect(result.stderr).toMatch(/Git runtime is unavailable/);
    expect(existsSync(project.directory)).toBe(false);
  },
);

test("the launcher forwards argument paths, stdin and the CLI's exit code", (t) => {
  const project = fixture(t);
  const saved = launch(project, {
    args: ["remember", "--id", "runtime-context"],
    input: JSON.stringify({
      expectedRevision: 0,
      scope: { type: "project" },
      text: "Use the available runtime after checking its version.",
      reason: "Missing dependencies can be prepared by the agent.",
      source: { type: "user", reference: "Chat: prepare missing Node or Git and retry." },
    }),
  });
  expect(saved.status, saved.stderr).toBe(0);
  expect(JSON.parse(saved.stdout).id).toBe("runtime-context");
  const invalid = launch(project, { args: ["remember", "--id", "../outside"] });
  expect(invalid.status, invalid.stderr).toBe(1);
});

test.for([
  ["20.19.0", false],
  ["22.17.0", false],
  ["22.18.0", true],
  ["22.19.0", true],
  ["23.6.0", false],
  ["24.0.0", true],
  ["25.0.0", false],
  ["26.0.0", true],
] as const)(
  "Node %s has the same support decision in the launcher and CLI",
  ([version, supported], t) => {
    const project = fixture(t);
    const preload = join(project.root, "node-version.cjs");
    writeFileSync(
      preload,
      `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(version)} });\n`,
    );
    const env = { ...process.env, NODE_OPTIONS: `--require="${preload}"` };
    const direct = spawnSync(
      process.execPath,
      [cliPath, "location", "--cwd", project.repo, "--data-dir", project.directory],
      { env, encoding: "utf8" },
    );
    for (const result of [launch(project, { env }), direct]) {
      expect(result.status, result.stderr).toBe(supported ? 0 : 2);
      if (!supported) expect(result.stderr).toContain("LOOM_NODE_UNSUPPORTED");
    }
    expect(existsSync(project.directory)).toBe(false);
  },
);
