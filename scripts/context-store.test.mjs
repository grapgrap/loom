import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDataDirectory } from "./context-store.mjs";

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
