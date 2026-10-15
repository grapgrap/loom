import { expect } from "vitest";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("cli.mjs", import.meta.url));

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "loom-context-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet");
  git(
    repo,
    "-c",
    "user.name=Loom Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "fixture",
  );
  return { root, repo, directory: join(root, "records") };
}

export function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function serialize(input) {
  return typeof input === "object" ? JSON.stringify(input) : input;
}

export function invoke(project, args, input, cwd = project.repo) {
  return spawnSync(
    process.execPath,
    [cli, ...args, "--cwd", cwd, "--data-dir", project.directory],
    { encoding: "utf8", input: serialize(input) },
  );
}

export function run(project, args, input, cwd) {
  const result = invoke(project, args, input, cwd);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

export function concurrentRequest(project, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      cli,
      ...args,
      "--cwd",
      project.repo,
      "--data-dir",
      project.directory,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(serialize(input));
  });
}
