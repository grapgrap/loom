import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, posix, resolve, win32 } from "node:path";
import { setTimeout } from "node:timers/promises";

export function resolveDataDirectory({ platform = process.platform, home: userHome = homedir(),
  env: environment = process.env, override: dataDirectoryOverride } = {}) {
  const platformPath = platform === "win32" ? win32 : posix;
  const configuredDirectory = dataDirectoryOverride ?? environment.LOOM_DATA_DIR;
  if (configuredDirectory !== undefined) {
    if (!platformPath.isAbsolute(configuredDirectory)) throw new Error("Loom data directory must be an absolute path");
    return platformPath.normalize(configuredDirectory);
  }
  if (platform === "darwin") return platformPath.join(userHome, "Library", "Application Support", "loom");
  if (platform === "win32") {
    const localAppDataDirectory = environment.LOCALAPPDATA || platformPath.join(userHome, "AppData", "Local");
    if (!platformPath.isAbsolute(localAppDataDirectory)) throw new Error("LOCALAPPDATA must be an absolute path");
    return platformPath.join(localAppDataDirectory, "loom");
  }
  const xdgDataDirectory = environment.XDG_DATA_HOME && platformPath.isAbsolute(environment.XDG_DATA_HOME)
    ? environment.XDG_DATA_HOME : platformPath.join(userHome, ".local", "share");
  return platformPath.join(xdgDataDirectory, "loom");
}

export async function resolveProjectLocation({ cwd = process.cwd(), directory } = {}) {
  const checkoutDirectory = await realpath(resolve(cwd));
  const gitEnvironment = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) delete gitEnvironment[key];
  const gitProcessOptions = { encoding: "utf8", env: gitEnvironment, stdio: ["ignore", "pipe", "pipe"] };
  try {
    execFileSync("git", ["--version"], gitProcessOptions);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw Object.assign(new Error("Git is not available on PATH. The agent should reuse an installed Git or install Git, verify git --version, and retry this command."),
      { code: "LOOM_GIT_MISSING" });
    }
    const detail = error.stderr?.toString().trim() || error.message;
    throw Object.assign(new Error(`Git --version failed: ${detail}. The agent should repair the Git executable's path, permissions or runtime, verify git --version, and retry this command.`),
    { code: "LOOM_GIT_UNUSABLE" });
  }
  let commonDirectoryOutput;
  try {
    commonDirectoryOutput = execFileSync("git", ["-C", checkoutDirectory, "rev-parse", "--path-format=absolute",
      "--git-common-dir"], gitProcessOptions);
  } catch (error) {
    throw new Error(`Cannot identify the Git repository at ${checkoutDirectory}: ${error.stderr?.toString().trim() || error.message}`);
  }
  const commonDirectory = await realpath(commonDirectoryOutput.replace(/\r?\n$/, ""));
  const projectId = createHash("sha256").update(commonDirectory).digest("hex");
  const dataDirectory = resolveDataDirectory({ override: directory });
  return { dataDirectory, projectDirectory: join(dataDirectory, "projects", projectId),
    project: { id: projectId, kind: "git", commonDirectory } };
}

export async function readStoredRecord(recordPath, parseRecord) {
  let serializedRecord;
  try {
    serializedRecord = await readFile(recordPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    return parseRecord(JSON.parse(serializedRecord));
  } catch (error) {
    throw new Error(`Invalid record at ${recordPath}: ${error.message}`);
  }
}

export async function readDirectoryEntries(directoryPath) {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

const lockTimeoutMs = 5000;

async function acquireRecordLock(lockPath) {
  const lockDeadline = Date.now() + lockTimeoutMs;
  while (true) {
    let lockFileHandle;
    try {
      lockFileHandle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= lockDeadline) {
        throw new Error(`Record is locked at ${lockPath}. Retry after the writer finishes; if it was interrupted, confirm no writer is running before removing this lock.`);
      }
      await setTimeout(25);
      continue;
    }
    try {
      await lockFileHandle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return lockFileHandle;
    } catch (error) {
      await lockFileHandle.close();
      await unlink(lockPath);
      throw error;
    }
  }
}

async function writeRecordAtomically(recordPath, record) {
  const temporaryPath = `${recordPath}.${randomUUID()}.tmp`;
  const temporaryFileHandle = await open(temporaryPath, "wx", 0o600);
  try {
    try {
      await temporaryFileHandle.writeFile(`${JSON.stringify(record, null, 2)}\n`);
      await temporaryFileHandle.sync();
    } finally {
      await temporaryFileHandle.close();
    }
    await rename(temporaryPath, recordPath);
  } finally {
    await unlink(temporaryPath).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}

export async function updateStoredRecord({ path: recordPath, parse: parseRecord, update: updateRecord }) {
  await mkdir(dirname(recordPath), { recursive: true, mode: 0o700 });
  const lockPath = `${recordPath}.lock`;
  const lockFileHandle = await acquireRecordLock(lockPath);
  try {
    const storedRecord = await readStoredRecord(recordPath, parseRecord);
    const updatedRecord = await updateRecord(storedRecord);
    if (updatedRecord !== storedRecord) await writeRecordAtomically(recordPath, updatedRecord);
    return updatedRecord;
  } finally {
    await lockFileHandle.close();
    await unlink(lockPath);
  }
}
