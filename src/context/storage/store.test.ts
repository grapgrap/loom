import { expect, test } from "vitest";
import { resolveDataDirectory } from "./store.ts";

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
