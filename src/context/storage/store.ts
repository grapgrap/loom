import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
export type ProjectLocation = Awaited<ReturnType<typeof resolveProjectLocation>>;
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, posix, resolve, win32 } from "node:path";
import { setTimeout } from "node:timers/promises";

export function resolveDataDirectory({
  platform = process.platform,
  home: userHome = homedir(),
  env: environment = process.env,
  override: dataDirectoryOverride,
}: { platform?: string; home?: string; env?: NodeJS.ProcessEnv; override?: string } = {}) {
  const platformPath = platform === "win32" ? win32 : posix;
  const configuredDirectory = dataDirectoryOverride ?? environment.LOOM_DATA_DIR;
  if (configuredDirectory !== undefined) {
    if (!platformPath.isAbsolute(configuredDirectory))
      throw new Error("Loom data directory must be an absolute path");
    return platformPath.normalize(configuredDirectory);
  }
  if (platform === "darwin")
    return platformPath.join(userHome, "Library", "Application Support", "loom");
  if (platform === "win32") {
    const localAppDataDirectory =
      environment.LOCALAPPDATA || platformPath.join(userHome, "AppData", "Local");
    if (!platformPath.isAbsolute(localAppDataDirectory))
      throw new Error("LOCALAPPDATA must be an absolute path");
    return platformPath.join(localAppDataDirectory, "loom");
  }
  const xdgDataDirectory =
    environment.XDG_DATA_HOME && platformPath.isAbsolute(environment.XDG_DATA_HOME)
      ? environment.XDG_DATA_HOME
      : platformPath.join(userHome, ".local", "share");
  return platformPath.join(xdgDataDirectory, "loom");
}

export async function resolveProjectLocation({
  cwd = process.cwd(),
  directory,
}: { cwd?: string; directory?: string } = {}) {
  const checkoutDirectory = await realpath(resolve(cwd));
  const gitEnvironment = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ])
    delete gitEnvironment[key];
  const gitProcessOptions: ExecFileSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    env: gitEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  };
  try {
    execFileSync("git", ["--version"], gitProcessOptions);
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException & { stderr?: Buffer };
    if (error.code === "ENOENT") {
      throw Object.assign(
        new Error(
          "Git is not available on PATH. The agent should reuse an installed Git or install Git, verify git --version, and retry this command.",
        ),
        { code: "LOOM_GIT_MISSING" },
      );
    }
    const detail = error.stderr?.toString().trim() || error.message;
    throw Object.assign(
      new Error(
        `Git --version failed: ${detail}. The agent should repair the Git executable's path, permissions or runtime, verify git --version, and retry this command.`,
      ),
      { code: "LOOM_GIT_UNUSABLE" },
    );
  }
  let commonDirectoryOutput;
  try {
    commonDirectoryOutput = execFileSync(
      "git",
      ["-C", checkoutDirectory, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      gitProcessOptions,
    );
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException & { stderr?: Buffer };
    throw new Error(
      `Cannot identify the Git repository at ${checkoutDirectory}: ${error.stderr?.toString().trim() || error.message}`,
    );
  }
  const commonDirectory = await realpath(commonDirectoryOutput.replace(/\r?\n$/, ""));
  const projectId = createHash("sha256").update(commonDirectory).digest("hex");
  const dataDirectory = resolveDataDirectory({ override: directory });
  return {
    dataDirectory,
    projectDirectory: join(dataDirectory, "projects", projectId),
    project: { id: projectId, kind: "git", commonDirectory },
  };
}

export async function readStoredRecord<T>(
  path: string,
  parse: (value: unknown) => T,
): Promise<T | null> {
  let serializedRecord;
  try {
    serializedRecord = await readFile(path, "utf8");
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException & { stderr?: Buffer };
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    return parse(JSON.parse(serializedRecord));
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException & { stderr?: Buffer };
    throw new Error(`Invalid record at ${path}: ${error.message}`);
  }
}

export async function readDirectoryEntries(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException & { stderr?: Buffer };
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

const lockTimeoutMs = 5000;

async function acquireRecordLock(lockPath: string) {
  const lockDeadline = Date.now() + lockTimeoutMs;
  while (true) {
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (caught) {
      const error = caught as NodeJS.ErrnoException & { stderr?: Buffer };
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= lockDeadline) {
        throw new Error(
          `Record is locked at ${lockPath}. Retry after the writer finishes; if it was interrupted, confirm no writer is running before removing this lock.`,
        );
      }
      await setTimeout(25);
      continue;
    }
    try {
      await lock.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
      );
      return lock;
    } catch (caught) {
      const error = caught as NodeJS.ErrnoException & { stderr?: Buffer };
      await lock.close();
      await unlink(lockPath);
      throw error;
    }
  }
}

async function writeRecordAtomically(path: string, record: unknown) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporaryPath, "wx", 0o600);
  try {
    try {
      await file.writeFile(`${JSON.stringify(record, null, 2)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

type RecordUpdate<T, U> = {
  path: string;
  parse: (value: unknown) => T;
  update: (current: NoInfer<T> | null) => U | Promise<U>;
};
export function updateStoredRecord<T>(options: RecordUpdate<T, NoInfer<T>>): Promise<T>;
export function updateStoredRecord<T>(
  options: RecordUpdate<T, NoInfer<T> | null>,
): Promise<T | null>;
export async function updateStoredRecord<T>({
  path,
  parse,
  update,
}: RecordUpdate<T, T | null>): Promise<T | null> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  const lock = await acquireRecordLock(lockPath);
  try {
    const current = await readStoredRecord(path, parse);
    const next = await update(current);
    if (next !== current) await writeRecordAtomically(path, next);
    return next;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
