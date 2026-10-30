import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, invoke, run } from "./testing.mjs";

function memory(id, text, sources, scope = { type: "project" }) {
  return { id, scope, text, reason: "Preserve the applicable contract.", sources };
}

function seed(project) {
  const first = run(
    project,
    ["record", "--work", "storage", "--source", "App decision"],
    "Remove the app retry loop.",
  );
  const second = run(
    project,
    ["record", "--work", "storage", "--source", "SDK decision"],
    "Keep the SDK retry defaults.",
  );
  const prepared = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: prepared.snapshot,
    memories: [
      memory("app-retry", first.text, [first.ref]),
      memory("sdk-retry", second.text, [second.ref]),
    ],
  });
  return { first, second };
}

test("revisit prepares existing memories without new records and preserves the selected scope", (t) => {
  const project = fixture(t);
  const { first } = seed(project);
  const note = run(
    project,
    ["record", "--work", "other", "--source", "Other work"],
    "Another retry decision.",
  );
  const prepared = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: prepared.snapshot,
    memories: [
      memory("storage-local", "Storage retry boundary.", [first.ref], {
        type: "work",
        id: "storage",
      }),
      memory("other-local", note.text, [note.ref], { type: "work", id: "other" }),
    ],
  });
  expect(run(project, ["tidy", "prepare"]).snapshot).toBe(null);
  const revisit = run(project, [
    "tidy",
    "prepare",
    "--revisit",
    "--work",
    "storage",
    "--query",
    "retry",
    "--limit",
    "2",
  ]);
  expect(revisit.snapshot).toBeTypeOf("string");
  expect(revisit.records).toStrictEqual([]);
  const location = run(project, ["location"]);
  const snapshot = JSON.parse(
    readFileSync(
      join(location.projectDirectory, "tidy-snapshots", `${revisit.snapshot}.json`),
      "utf8",
    ),
  );
  expect(snapshot.version).toBe(2);
  expect(revisit.current.memories.map(({ id }) => id)).toStrictEqual(["app-retry", "sdk-retry"]);
  expect(revisit.current.memoriesRemaining).toBe(1);
  const page = run(project, [
    "tidy",
    "prepare",
    "--revisit",
    "--work",
    "storage",
    "--query",
    "retry",
    "--limit",
    "2",
    "--offset",
    "2",
  ]);
  expect(page.current.memories.map(({ id }) => id)).toStrictEqual(["storage-local"]);
  expect(page.current.memoriesRemaining).toBe(0);
});

test("absorption replaces separate experiences with a pattern and a precise remaining contract", (t) => {
  const project = fixture(t);
  const { first, second } = seed(project);
  const prepared = run(project, ["tidy", "prepare", "--revisit", "--query", "retry"]);
  const arrived = run(
    project,
    ["record", "--work", "storage", "--source", "Later arrival"],
    "A new storage boundary still needs review.",
  );
  const changes = {
    snapshot: prepared.snapshot,
    memories: [
      memory("retry-boundary", "Distinguish application and SDK retry ownership.", [
        first.ref,
        second.ref,
      ]),
      memory("sdk-contract", "The SDK retry defaults remain enabled.", [second.ref]),
    ],
    absorb: [
      {
        from: ["app-retry", "sdk-retry"],
        into: ["retry-boundary", "sdk-contract"],
        reason: "The pattern covers the experiences; the current SDK contract remains precise.",
      },
    ],
  };
  const applied = run(project, ["tidy", "apply"], changes);
  expect(run(project, ["tidy", "apply"], changes).revision).toBe(applied.revision);
  const recalled = run(project, ["recall", "--work", "storage"]);
  expect(recalled.memories.map(({ id }) => id)).toStrictEqual(["retry-boundary", "sdk-contract"]);
  expect(recalled.pending.map(({ ref }) => ref)).toStrictEqual([arrived.ref]);
  expect(run(project, ["read", "--ref", first.ref]).text).toBe(first.text);
  expect(
    applied.report.changes.filter(({ action }) => action === "absorbed").map(({ id }) => id),
  ).toStrictEqual(["app-retry", "sdk-retry"]);
  const location = run(project, ["location"]);
  const current = JSON.parse(
    readFileSync(join(location.projectDirectory, "tidy.json"), "utf8"),
  ).revisions.at(-1);
  const consumed = current.memories.find(({ id }) => id === "app-retry");
  expect(consumed.status).toBe("absorbed");
  expect(consumed).not.toHaveProperty("text");
  expect(consumed.absorption.into).toStrictEqual(["retry-boundary", "sdk-contract"]);
  const next = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: next.snapshot });
  const following = JSON.parse(readFileSync(join(location.projectDirectory, "tidy.json"), "utf8"));
  expect(following.version).toBe(3);
  expect(JSON.stringify(following.revisions.at(-1))).not.toContain(first.text);
});

for (const [name, absorption, overrides, message] of [
  [
    "unselected source",
    { from: ["sdk-retry"], into: ["pattern"], reason: "Cover the experience." },
    {},
    /not selected/i,
  ],
  [
    "missing destination",
    { from: ["app-retry"], into: ["missing"], reason: "Cover the experience." },
    {},
    /active memory/i,
  ],
  [
    "unresolved destination",
    { from: ["app-retry"], into: ["pattern"], reason: "Cover the experience." },
    { status: "unresolved" },
    /active memory/i,
  ],
  [
    "self absorption",
    { from: ["app-retry"], into: ["app-retry"], reason: "Cover the experience." },
    {},
    /destination.*absorbed/i,
  ],
  [
    "duplicate source",
    { from: ["app-retry", "app-retry"], into: ["pattern"], reason: "Cover the experience." },
    {},
    /duplicate/i,
  ],
]) {
  test(`invalid absorption (${name}) leaves the published state unchanged`, (t) => {
    const project = fixture(t);
    const { first } = seed(project);
    const prepared = run(project, ["tidy", "prepare", "--revisit", "--query", "loop"]);
    const location = run(project, ["location"]);
    const path = join(location.projectDirectory, "tidy.json");
    const before = readFileSync(path, "utf8");
    const rejected = invoke(project, ["tidy", "apply"], {
      snapshot: prepared.snapshot,
      memories: [
        { ...memory("pattern", "Retries have explicit owners.", [first.ref]), ...overrides },
      ],
      absorb: [absorption],
    });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toMatch(message);
    expect(readFileSync(path, "utf8")).toBe(before);
  });
}

test("revisit rejects a stale memory selection after another tidy commits", (t) => {
  const project = fixture(t);
  const { first } = seed(project);
  const stale = run(project, ["tidy", "prepare", "--revisit"]);
  const arrived = run(
    project,
    ["record", "--work", "other", "--source", "Concurrent decision"],
    "Keep another contract.",
  );
  const current = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: current.snapshot,
    memories: [memory("other", arrived.text, [arrived.ref])],
  });
  const rejected = invoke(project, ["tidy", "apply"], {
    snapshot: stale.snapshot,
    memories: [memory("pattern", "Retries have explicit owners.", [first.ref])],
    absorb: [{ from: ["app-retry"], into: ["pattern"], reason: "Cover the experience." }],
  });
  expect(rejected.status).toBe(1);
  expect(rejected.stderr).toMatch(/revision conflict/i);
  expect(run(project, ["recall"]).memories.map(({ id }) => id)).toStrictEqual([
    "app-retry",
    "other",
    "sdk-retry",
  ]);
});

test("absorbed legacy memories stay consumed and original erasure still removes dependent patterns", (t) => {
  const project = fixture(t);
  run(project, ["remember", "--id", "legacy"], {
    expectedRevision: 0,
    ...memory("legacy", "An old app retry experiment.", []),
    source: { type: "user", reference: "Past experiment" },
  });
  const sdk = run(
    project,
    ["record", "--work", "storage", "--source", "SDK contract"],
    "Keep SDK retry defaults.",
  );
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: first.snapshot });
  const revisit = run(project, ["tidy", "prepare", "--revisit"]);
  run(project, ["tidy", "apply"], {
    snapshot: revisit.snapshot,
    memories: [
      memory("pattern", "Separate app and SDK retry responsibilities.", [
        "memory:legacy@1",
        sdk.ref,
      ]),
      memory("sdk-contract", sdk.text, [sdk.ref]),
    ],
    absorb: [
      {
        from: ["legacy"],
        into: ["pattern", "sdk-contract"],
        reason: "The pattern accepts the experience; the SDK contract remains explicit.",
      },
    ],
  });
  expect(run(project, ["recall"]).memories.map(({ id }) => id)).toStrictEqual([
    "pattern",
    "sdk-contract",
  ]);
  const later = run(project, ["tidy", "prepare", "--revisit"]);
  run(project, ["tidy", "apply"], { snapshot: later.snapshot });
  expect(run(project, ["recall"]).memories.map(({ id }) => id)).toStrictEqual([
    "pattern",
    "sdk-contract",
  ]);
  const restoring = run(project, ["tidy", "prepare", "--revisit"]);
  expect(
    invoke(project, ["tidy", "apply"], {
      snapshot: restoring.snapshot,
      memories: [memory("legacy", "Reintroduced detail.", [sdk.ref])],
    }).stderr,
  ).toMatch(/was absorbed/i);
  run(project, ["forget", "--id", "legacy", "--revision", "1"]);
  expect(run(project, ["recall"]).memories.map(({ id }) => id)).toStrictEqual(["sdk-contract"]);
});

test("absorption does not complete or rewrite the work that produced an experience", (t) => {
  const project = fixture(t);
  const { first, second } = seed(project);
  const work = run(project, ["work", "create", "--work", "runtime"], {
    expectedRevision: 0,
    actor: "main",
    goal: "Connect the runtime.",
    scope: "Runtime wiring remains separate from memory consolidation.",
    criteria: [
      {
        id: "runtime",
        description: "Runtime integration works.",
        verification: "Observe the integrated path.",
      },
    ],
    source: { type: "user", reference: "Runtime request" },
    next: ["Wire the actual runtime."],
  });
  const prepared = run(project, ["tidy", "prepare", "--revisit"]);
  run(project, ["tidy", "apply"], {
    snapshot: prepared.snapshot,
    memories: [memory("pattern", "Retries have distinct owners.", [first.ref, second.ref])],
    absorb: [
      {
        from: ["app-retry", "sdk-retry"],
        into: ["pattern"],
        reason: "Only the experiences are consolidated.",
      },
    ],
  });
  expect(run(project, ["work", "show", "--work", "runtime"]).work).toStrictEqual(work);
});
