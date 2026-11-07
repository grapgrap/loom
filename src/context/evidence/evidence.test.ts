import { afterEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation } from "../storage/store.ts";
import type { AppendInput, CorrectInput } from "./model.ts";
import { all, append, correct, read, readLedger, readResult } from "./evidence.ts";
import { checkChanges } from "./query.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture(): Promise<ProjectLocation> {
  const directory = await mkdtemp(join(tmpdir(), "loom-evidence-"));
  directories.push(directory);
  return {
    dataDirectory: directory,
    projectDirectory: join(directory, "project"),
    project: { id: "evidence-test", kind: "git", commonDirectory: join(directory, ".git") },
  };
}
const applies = {
  target: "combat",
  conditions: ["build C"],
  lifetime: "this project",
  targetVersion: "c1",
};
function input(overrides: Partial<AppendInput> = {}): AppendInput {
  return {
    requestKey: "first",
    id: "policy",
    scope: { type: "work", id: "combat" },
    text: "Avoid attacks outside focus. Keep range checks.",
    kind: "decision",
    standing: "adopted",
    applies,
    source: { type: "user", reference: "User message 1" },
    capture: "direct",
    ...overrides,
  };
}
async function correction(
  location: ProjectLocation,
  target: string,
  overrides: Partial<CorrectInput> = {},
) {
  const checked = await checkChanges(location, { seeds: [target] });
  return correct(location, {
    ...input({
      requestKey: "second",
      id: "amendment",
      kind: "correction",
      text: "The constraint is withdrawn.",
    }),
    relation: { type: "withdraws", target, applies },
    basis: checked.basis,
    ...overrides,
  });
}

test("append preserves exact immutable originals and exposes source-compatible records", async () => {
  const location = await fixture();
  const first = await append(location, input());
  const second = await append(
    location,
    input({ requestKey: "next", text: "A later independent capture." }),
  );
  expect(first).toMatchObject({
    outcome: "applied",
    status: "applied",
    ref: "evidence:policy@1",
    revision: 1,
    replayed: false,
  });
  expect(second.ref).toBe("evidence:policy@2");
  expect((await append(location, input())).record).toEqual(first.record);
  expect(await read(location, first.ref)).toMatchObject({
    text: input().text,
    kind: "evidence",
    recordKind: "decision",
    latest: false,
    access: { status: "not-attempted" },
  });
  expect(await all(location)).toHaveLength(2);
  await expect(read(location, "evidence:policy@3")).rejects.toMatchObject({
    code: "LOOM_EVIDENCE_REJECTED",
  });
  const stored = JSON.parse(
    await readFile(join(location.projectDirectory, "evidence", "ledger.json"), "utf8"),
  );
  expect(stored.entries[0]).toMatchObject({ kind: "decision", text: input().text, position: 1 });
});

test("request keys recover the original result after later writes and reject a different payload or operation", async () => {
  const location = await fixture();
  const original = await append(location, input());
  await append(location, input({ requestKey: "later", id: "other" }));
  expect(await append(location, input())).toMatchObject({ ref: original.ref, replayed: true });
  expect((await append(location, input())).record).toEqual(original.record);
  expect(await readResult(location, "first")).toMatchObject({ ref: original.ref, replayed: true });
  expect(await readResult(location, "absent")).toBeNull();
  await expect(append(location, input({ text: "Different input" }))).rejects.toMatchObject({
    code: "LOOM_EVIDENCE_REJECTED",
  });
  await expect(correction(location, original.ref, { requestKey: "first" })).rejects.toMatchObject({
    code: "LOOM_EVIDENCE_REJECTED",
  });
  expect((await readLedger(location)).entries).toHaveLength(2);
});

test("correction and its receipt are atomic, replay precedes stale-basis checks, and stale writes conflict", async () => {
  const location = await fixture();
  const original = await append(location, input());
  const basis = (await checkChanges(location, { seeds: [original.ref] })).basis;
  const changeInput: CorrectInput = {
    ...input({
      requestKey: "change",
      id: "change",
      text: "Replacement allowed.",
      kind: "correction",
    }),
    basis,
    relation: { target: original.ref, type: "replaces", applies },
  };
  const changed = await correct(location, changeInput);
  expect(await correct(location, changeInput)).toMatchObject({ ref: changed.ref, replayed: true });
  await expect(
    correct(location, { ...changeInput, id: "other", requestKey: "race" }),
  ).rejects.toMatchObject({ code: "LOOM_EVIDENCE_CONFLICT" });
  const ledger = await readLedger(location);
  expect(ledger.entries).toHaveLength(2);
  expect(ledger.entries[1].relation).toMatchObject({ target: original.ref, type: "replaces" });
  expect(ledger.requests).toHaveLength(2);
});

test("independent concurrent appends survive without an expected global revision", async () => {
  const location = await fixture();
  await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      append(location, input({ requestKey: `append-${index}`, id: `independent-${index}` })),
    ),
  );
  expect((await all(location)).map(({ ref }) => ref)).toHaveLength(5);
});

test("stored source access and reported capture remain explicit instead of promoting an interpretation", async () => {
  const location = await fixture();
  const saved = await append(
    location,
    input({
      kind: "inference",
      standing: "unresolved",
      capture: "reported",
      source: { type: "agent", reference: "Prior assistant report" },
      locator: { reference: "note:old@1" },
      access: { status: "unavailable", reason: "Original conversation is inaccessible" },
    }),
  );
  expect(await read(location, saved.ref)).toMatchObject({
    capture: "reported",
    source: { type: "agent" },
    access: { status: "unavailable" },
    locator: { reference: "note:old@1" },
  });
});

test("a broad target basis can guard a narrower correction without a false conflict", async () => {
  const location = await fixture();
  const original = await append(location, input());
  const basis = (await checkChanges(location, { seeds: [original.ref] })).basis;
  const changed = await correct(location, {
    ...input({ requestKey: "part", id: "part", kind: "correction" }),
    basis,
    relation: { target: original.ref, type: "withdraws", applies, selector: { start: 0, end: 5 } },
  });
  expect(changed.status).toBe("applied");
});

test("durable receipts reject corrupted capture content and missing correction relations", async () => {
  const location = await fixture();
  const original = await append(location, input());
  await correction(location, original.ref);
  const path = join(location.projectDirectory, "evidence", "ledger.json");
  const saved = await readFile(path, "utf8");
  const differentText = JSON.parse(saved);
  differentText.entries[0].text = "This is not the original captured input.";
  await writeFile(path, JSON.stringify(differentText));
  await expect(readLedger(location)).rejects.toThrow(/receipt/);
  const missingRelation = JSON.parse(saved);
  delete missingRelation.entries[1].relation;
  await writeFile(path, JSON.stringify(missingRelation));
  await expect(readLedger(location)).rejects.toThrow(/receipt/);
});
