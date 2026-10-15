import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { updateStoredRecord, readStoredRecord, resolveDataDirectory } from "./store.mjs";

test("macOS stores Loom data in the user's Application Support directory", () => {
  assert.equal(resolveDataDirectory({ platform: "darwin", home: "/Users/example", env: {} }),
    "/Users/example/Library/Application Support/loom");
});

test("Windows respects LocalAppData and falls back to the user profile", () => {
  assert.equal(resolveDataDirectory({ platform: "win32", home: "C:\\Users\\example", env: {} }),
    "C:\\Users\\example\\AppData\\Local\\loom");
  assert.equal(resolveDataDirectory({ platform: "win32", home: "C:\\Users\\example",
    env: { LOCALAPPDATA: "D:\\AppData" } }), "D:\\AppData\\loom");
  assert.throws(() => resolveDataDirectory({ platform: "win32", home: "C:\\Users\\example",
    env: { LOCALAPPDATA: "relative" } }), /absolute path/);
});

test("Linux uses XDG data storage, ignoring an invalid relative XDG path", () => {
  const options = { platform: "linux", home: "/home/example" };
  assert.equal(resolveDataDirectory({ ...options, env: {} }), "/home/example/.local/share/loom");
  assert.equal(resolveDataDirectory({ ...options, env: { XDG_DATA_HOME: "/data" } }), "/data/loom");
  assert.equal(resolveDataDirectory({ ...options, env: { XDG_DATA_HOME: "relative" } }),
    "/home/example/.local/share/loom");
});

test("an explicit absolute path overrides configuration, and invalid Loom paths fail", () => {
  const options = { platform: "linux", home: "/home/example", env: { LOOM_DATA_DIR: "/configured" } };
  assert.equal(resolveDataDirectory(options), "/configured");
  assert.equal(resolveDataDirectory({ ...options, override: "/chosen" }), "/chosen");
  assert.throws(() => resolveDataDirectory({ ...options, override: "relative" }), /absolute path/);
  assert.throws(() => resolveDataDirectory({ ...options, env: { LOOM_DATA_DIR: "" } }), /absolute path/);
  assert.equal(resolveDataDirectory({ platform: "win32", home: "C:\\Users\\example", env: {},
    override: "D:\\Loom" }), "D:\\Loom");
});

test("a record mutation keeps its lock through asynchronous work before another writer reads", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "loom-async-record-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "record.json");
  const parse = (record) => {
    assert.equal(typeof record.count, "number");
    return record;
  };
  let notifyLocked;
  let releaseFirst;
  const locked = new Promise((resolve) => { notifyLocked = resolve; });
  const released = new Promise((resolve) => { releaseFirst = resolve; });
  const first = updateStoredRecord({ path, parse, async update() {
    notifyLocked();
    await released;
    return { count: 1 };
  } });
  await locked;
  const second = updateStoredRecord({ path, parse,
    update: (record) => ({ count: record.count + 1 }) });
  const writes = Promise.all([first, second]);
  releaseFirst();
  assert.deepEqual(await writes, [{ count: 1 }, { count: 2 }]);
  assert.deepEqual(await readStoredRecord(path, parse), { count: 2 });
});
