import { expect, test } from "vitest";
import { resolveDataDirectory } from "./store.ts";
import * as storage from "./store.ts";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("project mutations serialize correction checks with derived writes", async (t) => {
  const projectDirectory = await mkdtemp(join(tmpdir(), "loom-lock-"));
  t.onTestFinished(() => rm(projectDirectory, { recursive: true, force: true }));
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const ready = new Promise<void>((resolve) => (entered = resolve));
  const events: string[] = [];
  const first = storage.withProjectLock({ projectDirectory }, async () => {
    events.push("check");
    entered();
    await gate;
    events.push("write");
  });
  await ready;
  const second = storage.withProjectLock({ projectDirectory }, async () => {
    events.push("correction");
  });
  release();
  await Promise.all([first, second]);
  expect(events).toEqual(["check", "write", "correction"]);
});

test("cleanup failure after a successful mutation reports an unknown outcome", async (t) => {
  const projectDirectory = await mkdtemp(join(tmpdir(), "loom-lock-"));
  t.onTestFinished(() => rm(projectDirectory, { recursive: true, force: true }));
  await expect(
    storage.withProjectLock({ projectDirectory }, async () => {
      const lock = join(projectDirectory, ".context.lock");
      await rm(lock);
      await mkdir(lock);
      return "saved";
    }),
  ).rejects.toMatchObject({ outcome: "outcome-unknown" });
});

test("an inaccessible storage parent fails before the mutation starts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "loom-lock-"));
  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  const parent = join(root, "file");
  await writeFile(parent, "not a directory");
  let called = false;
  await expect(
    storage.withProjectLock({ projectDirectory: parent }, async () => {
      called = true;
    }),
  ).rejects.toMatchObject({ outcome: "failed" });
  expect(called).toBe(false);
});

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
