import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { updateStoredRecord, readStoredRecord, resolveDataDirectory } from "./store.ts";

test("macOS stores Loom data in the user's Application Support directory", () => {
  expect(resolveDataDirectory({ platform: "darwin", home: "/Users/example", env: {} })).toBe(
    "/Users/example/Library/Application Support/loom",
  );
});

test("Windows respects LocalAppData and falls back to the user profile", () => {
  expect(resolveDataDirectory({ platform: "win32", home: "C:\\Users\\example", env: {} })).toBe(
    "C:\\Users\\example\\AppData\\Local\\loom",
  );
  expect(
    resolveDataDirectory({
      platform: "win32",
      home: "C:\\Users\\example",
      env: { LOCALAPPDATA: "D:\\AppData" },
    }),
  ).toBe("D:\\AppData\\loom");
  expect(() =>
    resolveDataDirectory({
      platform: "win32",
      home: "C:\\Users\\example",
      env: { LOCALAPPDATA: "relative" },
    }),
  ).toThrowError(/absolute path/);
});

test("Linux uses XDG data storage, ignoring an invalid relative XDG path", () => {
  const options = { platform: "linux", home: "/home/example" };
  expect(resolveDataDirectory({ ...options, env: {} })).toBe("/home/example/.local/share/loom");
  expect(resolveDataDirectory({ ...options, env: { XDG_DATA_HOME: "/data" } })).toBe("/data/loom");
  expect(resolveDataDirectory({ ...options, env: { XDG_DATA_HOME: "relative" } })).toBe(
    "/home/example/.local/share/loom",
  );
});

test("an explicit absolute path overrides configuration, and invalid Loom paths fail", () => {
  const options = {
    platform: "linux",
    home: "/home/example",
    env: { LOOM_DATA_DIR: "/configured" },
  };
  expect(resolveDataDirectory(options)).toBe("/configured");
  expect(resolveDataDirectory({ ...options, override: "/chosen" })).toBe("/chosen");
  expect(() => resolveDataDirectory({ ...options, override: "relative" })).toThrowError(
    /absolute path/,
  );
  expect(() => resolveDataDirectory({ ...options, env: { LOOM_DATA_DIR: "" } })).toThrowError(
    /absolute path/,
  );
  expect(
    resolveDataDirectory({
      platform: "win32",
      home: "C:\\Users\\example",
      env: {},
      override: "D:\\Loom",
    }),
  ).toBe("D:\\Loom");
});

test("a record mutation keeps its lock through asynchronous work before another writer reads", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "loom-async-record-"));
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "record.json");
  const parse = (value: unknown) => {
    const record = value as { count: number };
    expect(typeof record.count).toBe("number");
    return record;
  };
  let notifyLocked!: () => void;
  let releaseFirst!: () => void;
  const locked = new Promise<void>((resolve) => {
    notifyLocked = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first = updateStoredRecord({
    path,
    parse,
    async update() {
      notifyLocked();
      await released;
      return { count: 1 };
    },
  });
  await locked;
  const second = updateStoredRecord({
    path,
    parse,
    update: (record) => ({ count: record!.count + 1 }),
  });
  const writes = Promise.all([first, second]);
  releaseFirst();
  expect(await writes).toStrictEqual([{ count: 1 }, { count: 2 }]);
  expect(await readStoredRecord(path, parse)).toStrictEqual({ count: 2 });
});
