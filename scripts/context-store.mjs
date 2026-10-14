import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, posix, resolve, win32 } from "node:path";
import { setTimeout } from "node:timers/promises";

export function resolveDataDirectory({ platform = process.platform, home = homedir(),
  env = process.env, override } = {}) {
  const paths = platform === "win32" ? win32 : posix;
  const configured = override ?? env.LOOM_DATA_DIR;
  if (configured !== undefined) {
    if (!paths.isAbsolute(configured)) throw new Error("Loom data directory must be an absolute path");
    return paths.normalize(configured);
  }
  if (platform === "darwin") return paths.join(home, "Library", "Application Support", "loom");
  if (platform === "win32") {
    const base = env.LOCALAPPDATA || paths.join(home, "AppData", "Local");
    if (!paths.isAbsolute(base)) throw new Error("LOCALAPPDATA must be an absolute path");
    return paths.join(base, "loom");
  }
  const base = env.XDG_DATA_HOME && paths.isAbsolute(env.XDG_DATA_HOME)
    ? env.XDG_DATA_HOME : paths.join(home, ".local", "share");
  return paths.join(base, "loom");
}

export async function projectLocation({ cwd = process.cwd(), directory } = {}) {
  const checkout = await realpath(resolve(cwd));
  const gitEnv = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) delete gitEnv[key];
  const gitOptions = { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "pipe"] };
  try {
    execFileSync("git", ["--version"], gitOptions);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw Object.assign(new Error("Git is not available on PATH. The agent should reuse an installed Git or install Git, verify git --version, and retry this command."),
      { code: "LOOM_GIT_MISSING" });
    }
    const detail = error.stderr?.toString().trim() || error.message;
    throw Object.assign(new Error(`Git --version failed: ${detail}. The agent should repair the Git executable's path, permissions or runtime, verify git --version, and retry this command.`),
    { code: "LOOM_GIT_UNUSABLE" });
  }
  let commonPath;
  try {
    commonPath = execFileSync("git", ["-C", checkout, "rev-parse", "--path-format=absolute",
      "--git-common-dir"], gitOptions);
  } catch (error) {
    throw new Error(`Cannot identify the Git repository at ${checkout}: ${error.stderr?.toString().trim() || error.message}`);
  }
  const commonDirectory = await realpath(commonPath.replace(/\r?\n$/, ""));
  const id = createHash("sha256").update(commonDirectory).digest("hex");
  const dataDirectory = resolveDataDirectory({ override: directory });
  return { dataDirectory, projectDirectory: join(dataDirectory, "projects", id),
    project: { id, kind: "git", commonDirectory } };
}

export async function readRecord(path, validate) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    return validate(JSON.parse(content));
  } catch (error) {
    throw new Error(`Invalid record at ${path}: ${error.message}`);
  }
}

export async function directoryEntries(path) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

const lockTimeoutMs = 5000;

async function acquireLock(path) {
  const deadline = Date.now() + lockTimeoutMs;
  while (true) {
    let lock;
    try {
      lock = await open(path, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error(`Record is locked at ${path}. Retry after the writer finishes; if it was interrupted, confirm no writer is running before removing this lock.`);
      }
      await setTimeout(25);
      continue;
    }
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return lock;
    } catch (error) {
      await lock.close();
      await unlink(path);
      throw error;
    }
  }
}

async function writeAtomic(path, record) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(`${JSON.stringify(record, null, 2)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}

export async function mutateRecord({ path, validate, update }) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  const lock = await acquireLock(lockPath);
  try {
    const existing = await readRecord(path, validate);
    const next = validate(update(existing));
    if (next !== existing) await writeAtomic(path, next);
    return next;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
