import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation } from "../storage/store.ts";
import type { AppendInput, Relation, Selector } from "./model.ts";
import { all, append, correct, readLedger } from "./evidence.ts";
import { basisFingerprint, checkChanges, checkLedgerChanges, discover } from "./query.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture(): Promise<ProjectLocation> {
  const directory = await mkdtemp(join(tmpdir(), "loom-evidence-query-"));
  directories.push(directory);
  return {
    dataDirectory: directory,
    projectDirectory: join(directory, "project"),
    project: { id: "query-test", kind: "git", commonDirectory: join(directory, ".git") },
  };
}
const applies = { target: "combat", conditions: [], lifetime: "project" };
function input(id: string, overrides: Partial<AppendInput> = {}): AppendInput {
  return {
    requestKey: id,
    id,
    scope: { type: "work", id: "combat" },
    text: "Avoid outside focus attacks. Keep range checks.",
    kind: "decision",
    standing: "adopted",
    applies,
    source: { type: "user", reference: `User ${id}` },
    capture: "direct",
    ...overrides,
  };
}
async function amend(
  location: ProjectLocation,
  id: string,
  target: string,
  type: Relation["type"],
  overrides: Partial<AppendInput> = {},
  selector?: Selector,
) {
  const seed = { ref: target, ...(selector ? { selector } : {}) };
  return correct(location, {
    ...input(id, { kind: "correction", text: "The prior choice changes.", ...overrides }),
    relation: { target, type, applies, ...(selector ? { selector } : {}) },
    basis: (await checkChanges(location, { seeds: [seed] })).basis,
  });
}

test("correction closure bypasses search rank and work filters and withdrawing a replacement never revives the old rule", async () => {
  const location = await fixture();
  const first = await append(location, input("ban"));
  const discovered = await discover(location, {
    query: "outside focus",
    work: "combat",
    maxGroups: 1,
  });
  const before = await checkChanges(location, { seeds: [first.ref] });
  const replacement = await amend(location, "replacement", first.ref, "replaces", {
    text: "Use the revised option.",
    scope: { type: "work", id: "elsewhere" },
  });
  const withdrawal = await amend(location, "withdrawal", replacement.ref, "withdraws");
  const checked = await checkChanges(location, {
    seeds: [discovered.groups[0].matches[0].ref],
    basis: before.basis,
  });
  expect(checked).toMatchObject({ coverage: "complete", change: "changed" });
  expect(checked.records.map(({ ref }) => ref)).toEqual([
    first.ref,
    replacement.ref,
    withdrawal.ref,
  ]);
  expect(checked.standings.find(({ ref }) => ref === first.ref)?.standing).toBe("replaced");
  expect(checked.standings.find(({ ref }) => ref === replacement.ref)?.standing).toBe("withdrawn");
});

test("a proposed replacement keeps the adopted rule and adoption requires a new explicit event", async () => {
  const location = await fixture();
  const first = await append(location, input("rule"));
  const proposal = await amend(location, "proposal", first.ref, "replaces", {
    kind: "proposal",
    standing: "proposed",
  });
  const proposed = await checkChanges(location, { seeds: [first.ref] });
  expect(proposed.standings.find(({ ref }) => ref === first.ref)?.standing).toBe("adopted");
  expect(proposed.relations[0].effective).toBe(false);
  await amend(location, "adoption", proposal.ref, "adopts");
  const adopted = await checkChanges(location, { seeds: [first.ref] });
  expect(adopted.standings.find(({ ref }) => ref === first.ref)?.standing).toBe("replaced");
});

test("partial corrections preserve the unselected text and distinguish affected applicability", async () => {
  const location = await fixture();
  const first = await append(
    location,
    input("two-rules", {
      units: [
        { id: "focus", start: 0, end: 28 },
        { id: "range", start: 29, end: 47 },
      ],
    }),
  );
  const correction = await amend(
    location,
    "focus-only",
    first.ref,
    "withdraws",
    {},
    { unit: "focus" },
  );
  const checked = await checkChanges(location, { seeds: [first.ref] });
  expect(checked.standings.find(({ ref }) => ref === first.ref)?.standing).toBe("partial");
  const focus = await checkChanges(location, {
    seeds: [{ ref: first.ref, selector: { unit: "focus" } }],
  });
  expect(focus.standings.find(({ ref }) => ref === first.ref)?.standing).toBe("withdrawn");
  const range = await checkChanges(location, {
    seeds: [{ ref: first.ref, selector: { unit: "range" } }],
  });
  expect(range.records.map(({ ref }) => ref)).not.toContain(correction.ref);
  expect(range.standings.find(({ ref }) => ref === first.ref)?.standing).toBe("adopted");
});

test("tokens detect relevant changes while new independent evidence only changes the discovery basis", async () => {
  const location = await fixture();
  const first = await append(
    location,
    input("experiment", {
      kind: "observation",
      standing: "observed",
      text: "Timing result: 3 seconds.",
      applies: { ...applies, targetVersion: "old" },
    }),
  );
  const before = await checkChanges(location, { seeds: [first.ref] });
  const discovered = await discover(location, { query: "Timing" });
  await append(
    location,
    input("new-experiment", {
      kind: "observation",
      standing: "observed",
      text: "Timing result: 1.5 seconds.",
      applies: { ...applies, targetVersion: "new" },
    }),
  );
  const after = await checkChanges(location, { seeds: [first.ref], basis: before.basis });
  expect(after).toMatchObject({ change: "unchanged", at: 2 });
  expect(after.basis).not.toBe(before.basis);
  expect(basisFingerprint(after.basis)).toBe(basisFingerprint(before.basis));
  expect((await discover(location, { query: "Timing" })).discoveryBasis.fingerprint).not.toBe(
    discovered.discoveryBasis.fingerprint,
  );
  expect(
    checkLedgerChanges(await readLedger(location), {
      seeds: [first.ref],
      at: 1,
      basis: before.basis,
    }),
  ).toMatchObject({ coverage: "complete", change: "unchanged", at: 1 });
});

test("discovery groups revisions before limits and cursor pages stay at a fixed ledger boundary", async () => {
  const location = await fixture();
  for (let index = 1; index <= 201; index++)
    await append(
      location,
      input("repeat", {
        requestKey: `repeat-${index}`,
        text: `Queue backpressure revision ${index}.`,
      }),
    );
  await append(
    location,
    input("independent", { text: "Queue backpressure for independent producers." }),
  );
  const page = await discover(location, { query: "Queue backpressure", maxGroups: 1 });
  expect(page.groups).toHaveLength(1);
  expect(page.nextCursor).toBeTypeOf("string");
  await append(location, input("later", { text: "Queue backpressure arriving later." }));
  const next = await discover(location, {
    query: "Queue backpressure",
    maxGroups: 1,
    cursor: page.nextCursor,
  });
  expect(next.at).toBe(202);
  expect(new Set([...page.groups, ...next.groups].map(({ id }) => id)).size).toBe(2);
  expect(next.nextCursor).toBeUndefined();
  await expect(
    discover(location, { query: "different query", maxGroups: 1, cursor: page.nextCursor }),
  ).rejects.toMatchObject({ code: "LOOM_EVIDENCE_REJECTED" });
  expect((await all(location)).filter(({ id }) => id === "repeat")).toHaveLength(201);
});

test("a correction budget reports partial coverage and never claims unchanged completeness", async () => {
  const location = await fixture();
  const first = await append(location, input("rule"));
  const before = await checkChanges(location, { seeds: [first.ref] });
  await amend(location, "change", first.ref, "withdraws");
  const checked = await checkChanges(location, {
    seeds: [first.ref],
    basis: before.basis,
    budget: 1,
  });
  expect(checked).toMatchObject({ coverage: "partial", change: "unknown" });
  expect(checked.gaps).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "budget" })]),
  );
});

test("an added seed changes the dependency basis without making an ordinary refresh fail", async () => {
  const location = await fixture();
  const one = await append(location, input("one"));
  const two = await append(location, input("two"));
  const before = await checkChanges(location, { seeds: [one.ref] });
  expect(
    await checkChanges(location, { seeds: [one.ref, two.ref], basis: before.basis }),
  ).toMatchObject({ change: "changed", coverage: "complete" });
  expect(await checkChanges(location, { seeds: [], at: 0 })).toMatchObject({
    at: 0,
    coverage: "complete",
    records: [],
  });
});

test("withdrawing an adoption ends its adopted proposal without rolling the old replacement back", async () => {
  const location = await fixture();
  const original = await append(location, input("original"));
  const proposal = await amend(location, "proposal", original.ref, "replaces", {
    kind: "proposal",
    standing: "proposed",
  });
  const adopted = await amend(location, "accepted", proposal.ref, "adopts");
  await amend(location, "withdraw-adoption", adopted.ref, "withdraws");
  const checked = await checkChanges(location, { seeds: [original.ref] });
  expect(checked.standings.find(({ ref }) => ref === original.ref)?.standing).toBe("replaced");
  expect(checked.standings.find(({ ref }) => ref === proposal.ref)?.standing).toBe("unresolved");
});

test("closure merges selectors when two seeds reach different parts of the same target", async () => {
  const location = await fixture();
  const original = await append(location, input("two-parts"));
  const first = await amend(
    location,
    "first-part",
    original.ref,
    "withdraws",
    {},
    { start: 0, end: 10 },
  );
  const second = await amend(
    location,
    "second-part",
    original.ref,
    "replaces",
    { kind: "proposal", standing: "proposed" },
    { start: 30, end: 40 },
  );
  const third = await amend(
    location,
    "second-withdrawal",
    original.ref,
    "withdraws",
    {},
    { start: 30, end: 40 },
  );
  const checked = await checkChanges(location, { seeds: [first.ref, second.ref] });
  expect(checked.coverage).toBe("complete");
  expect(checked.records.map(({ ref }) => ref)).toContain(third.ref);
});

test("fixed positions exclude later corrections while current checks include them", async () => {
  const location = await fixture();
  const original = await append(location, input("original"));
  const before = await checkChanges(location, { seeds: [original.ref] });
  const amended = await amend(location, "amended", original.ref, "withdraws");
  const fixed = await checkChanges(location, {
    seeds: [original.ref],
    at: before.at,
    basis: before.basis,
  });
  expect(fixed).toMatchObject({ change: "unchanged", coverage: "complete", at: 1 });
  expect(fixed.records.map(({ ref }) => ref)).toEqual([original.ref]);
  expect(
    (await checkChanges(location, { seeds: [original.ref], basis: before.basis })).records.map(
      ({ ref }) => ref,
    ),
  ).toContain(amended.ref);
});

test("independent accepted replacements of the same range remain a conflict even with identical applicability", async () => {
  const location = await fixture();
  const original = await append(location, input("original"));
  const first = await amend(location, "first-replacement", original.ref, "replaces", {
    text: "Use the first revised strategy.",
  });
  const second = await amend(location, "second-replacement", original.ref, "replaces", {
    text: "Use a different revised strategy.",
  });
  const checked = await checkChanges(location, { seeds: [original.ref] });
  expect(checked.conflicts).toEqual([
    {
      target: original.ref,
      refs: [first.ref, second.ref],
      reason: expect.stringContaining("agent's judgment"),
    },
  ]);
  expect(checked.standings.find(({ ref }) => ref === first.ref)?.standing).toBe("adopted");
  expect(checked.standings.find(({ ref }) => ref === second.ref)?.standing).toBe("adopted");
});

test("accepted replacements of disjoint ranges do not introduce a replacement conflict", async () => {
  const location = await fixture();
  const original = await append(location, input("original"));
  await amend(location, "first-part", original.ref, "replaces", {}, { start: 0, end: 10 });
  await amend(location, "second-part", original.ref, "replaces", {}, { start: 20, end: 30 });
  expect((await checkChanges(location, { seeds: [original.ref] })).conflicts).toEqual([]);
});
