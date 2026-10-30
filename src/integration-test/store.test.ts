import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { updateStoredRecord, readStoredRecord } from "../context/storage/store.ts";

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
