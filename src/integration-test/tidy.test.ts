import type { Fixture } from "./testing.ts";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { fixture, git, invoke, run, concurrentRequest } from "./testing.ts";

function record(project: Fixture, work: string, text: string, source = text) {
  return run(project, ["record", "--work", work, "--source", source], text);
}

function memory(id: string, text: string, sources: string[], overrides = {}) {
  return {
    id,
    scope: { type: "project" },
    text,
    reason: "A reusable constraint supported by the cited records.",
    sources,
    ...overrides,
  };
}

test("daily text records survive worktree removal without rewriting a checkpoint", (t) => {
  const project = fixture(t);
  const worktree = join(project.root, "worktree");
  git(project.repo, "worktree", "add", "--quiet", "--detach", worktree);
  const args = [
    "record",
    "--work",
    "storage",
    "--source",
    "User: preserve context outside checkouts",
    "--by",
    "user",
  ];
  const saved = run(project, args, "워크트리 삭제 후에도 기억을 보존한다.", worktree);
  expect(saved.ref).toBe("note:storage@1");
  expect(saved.source.type).toBe("user");
  expect(run(project, [...args, "--key", saved.requestKey], saved.text, worktree)).toStrictEqual(
    saved,
  );
  git(project.repo, "worktree", "remove", worktree);
  const resumed = run(project, ["recall", "--work", "storage"]);
  expect(resumed.pending[0].text).toBe(saved.text);
  expect(resumed.work).toBe(null);
  expect(run(project, ["recall", "--work", "unrelated"]).pending.length).toBe(0);
  expect(git(project.repo, "status", "--porcelain")).toBe("");
  expect(existsSync(join(project.repo, "notes.json"))).toBe(false);
});

test("a repeated observation is a new event, while a retry uses its original request key", (t) => {
  const project = fixture(t);
  const first = record(project, "storage", "The same check passed.", "yarn test");
  const second = record(project, "storage", "The same check passed.", "yarn test");
  expect(first.ref).not.toBe(second.ref);
  const args = ["record", "--work", "storage", "--source", "yarn test", "--key", first.requestKey];
  expect(run(project, args, first.text)).toStrictEqual(first);
  expect(invoke(project, args, "Different content for the same request.").status).toBe(1);
  expect(run(project, ["recall", "--work", "storage"]).pending.length).toBe(2);
});

test("tidy publishes grounded changes while preserving raw records, other work, and new arrivals", (t) => {
  const project = fixture(t);
  const old = record(project, "storage", "Use a temporary JSON input file.", "Experiment A");
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [memory("input-method", old.text, [old.ref])],
    works: [
      {
        id: "storage",
        goal: "Save context without checkout changes.",
        status: "active",
        progress: "An initial input path was tried.",
        evidence: [old.ref],
        next: ["Check whether input files appear in the change list."],
        sources: [old.ref],
      },
    ],
  });
  const other = record(
    project,
    "other",
    "Keep the graph experiment isolated.",
    "User: separate task",
  );
  const next = record(
    project,
    "storage",
    "Input files appear in changes; send plain text through stdin.",
    "Observed change list and user agreement",
  );
  const second = run(project, ["tidy", "prepare"]);
  const arrived = record(
    project,
    "storage",
    "Windows execution still needs a native check.",
    "Verification boundary",
  );
  const submission = {
    snapshot: second.snapshot,
    memories: [
      memory("input-method", "Send daily records through stdin.", [next.ref], {
        supersedes: [old.ref],
      }),
    ],
    works: [
      {
        id: "other",
        goal: "Run an isolated graph experiment.",
        status: "active",
        progress: other.text,
        evidence: [other.ref],
        next: ["Compare the next run."],
        sources: [other.ref],
      },
    ],
  };
  const published = run(project, ["tidy", "apply"], submission);
  expect(published.revision).toBe(2);
  expect(run(project, ["tidy", "apply"], submission).revision).toBe(2);
  const resumed = run(project, ["recall", "--work", "storage"]);
  expect(resumed.memories[0].text).toBe("Send daily records through stdin.");
  expect(resumed.memories[0].supersedes).toStrictEqual([old.ref]);
  expect(resumed.work.goal).toBe("Save context without checkout changes.");
  expect(resumed.pending.map(({ ref }: { ref: string }) => ref)).toStrictEqual([arrived.ref]);
  expect(run(project, ["read", "--ref", old.ref]).text).toBe(old.text);
  expect(run(project, ["recall", "--work", "other"]).work.progress).toBe(other.text);
  expect(git(project.repo, "status", "--porcelain")).toBe("");
});

test("invalid provenance and stale tidy snapshots do not advance the processed range", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "Store outside the checkout.");
  const first = run(project, ["tidy", "prepare"]);
  const second = run(project, ["tidy", "prepare"]);
  const invalid = invoke(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [memory("location", "Invented fact.", ["note:storage@99"])],
  });
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toMatch(/source|reference|snapshot/i);
  expect(run(project, ["recall", "--work", "storage"]).pending.length).toBe(1);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [memory("location", note.text, [note.ref])],
  });
  const stale = invoke(project, ["tidy", "apply"], {
    snapshot: second.snapshot,
    memories: [memory("location", "A stale replacement.", [note.ref])],
  });
  expect(stale.status).toBe(1);
  expect(stale.stderr).toMatch(/conflict|stale/i);
  expect(run(project, ["recall"]).memories[0].text).toBe(note.text);
});

test("tidy projects its changes without carrying unrelated input metadata into recalled state", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "A verified observation.");
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    metadata: "Caller-only metadata.",
    memories: [memory("location", note.text, [note.ref], { metadata: "Caller-only metadata." })],
    works: [
      {
        id: "storage",
        goal: "Preserve context.",
        status: "active",
        progress: note.text,
        evidence: [note.ref],
        next: ["Check the next observation."],
        sources: [note.ref],
        metadata: "Caller-only metadata.",
      },
    ],
  });
  const recalled = run(project, ["recall", "--work", "storage"]);
  expect(recalled.memories[0].text).toBe(note.text);
  expect(recalled.work.progress).toBe(note.text);
  expect(Object.hasOwn(recalled.memories[0], "metadata")).toBe(false);
  expect(Object.hasOwn(recalled.work, "metadata")).toBe(false);
  expect(recalled.pending).toStrictEqual([]);
});

test("bounded tidy batches never skip remaining records or convert uncertainty into agreement", (t) => {
  const project = fixture(t);
  const notes = [
    "A choice is proposed.",
    "The choice is disputed.",
    "An experiment remains inconclusive.",
  ].map((text) => record(project, "experiment", text));
  const first = run(project, ["tidy", "prepare", "--limit", "2"]);
  expect(first.records.map(({ ref }: { ref: string }) => ref)).toStrictEqual(
    notes.slice(0, 2).map(({ ref }: { ref: string }) => ref),
  );
  expect(first.remaining).toBe(1);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [
      memory("open-choice", "The choice remains unresolved.", [notes[0].ref, notes[1].ref], {
        scope: { type: "work", id: "experiment" },
        status: "unresolved",
      }),
    ],
  });
  expect(run(project, ["recall"]).memories).toStrictEqual([]);
  const resumed = run(project, ["recall", "--work", "experiment"]);
  expect(resumed.memories[0].status).toBe("unresolved");
  expect(resumed.pending.map(({ ref }: { ref: string }) => ref)).toStrictEqual([notes[2].ref]);
  expect(
    run(project, ["tidy", "prepare"]).records.map(({ ref }: { ref: string }) => ref),
  ).toStrictEqual([notes[2].ref]);
});

test("snapshot hashes define the processed batch without a duplicate cursor or reference list", (t) => {
  const project = fixture(t);
  record(project, "earlier", "Keep the processed range from earlier work.");
  const initial = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: initial.snapshot });
  const prepared = [
    record(project, "storage", "First observation."),
    record(project, "storage", "Second observation."),
    record(project, "storage", "Third observation."),
  ];
  const batch = run(project, ["tidy", "prepare", "--limit", "2"]);
  const location = run(project, ["location"]);
  const snapshotPath = join(location.projectDirectory, "tidy-snapshots", `${batch.snapshot}.json`);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  expect(Object.hasOwn(snapshot, "cursor")).toBe(false);
  expect(Object.hasOwn(snapshot, "refs")).toBe(false);
  expect(Object.keys(snapshot.hashes)).toStrictEqual(
    prepared.slice(0, 2).map(({ ref }: { ref: string }) => ref),
  );
  snapshot.hashes = Object.fromEntries(Object.entries(snapshot.hashes).reverse());
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const arrived = record(project, "storage", "Arrived after preparation.");
  const applied = run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  expect(applied.cursor).toStrictEqual({
    memory: {},
    checkpoint: {},
    note: { earlier: 1, storage: 2 },
  });
  expect(
    run(project, ["recall", "--work", "storage"]).pending.map(({ ref }: { ref: string }) => ref),
  ).toStrictEqual([prepared[2].ref, arrived.ref]);
  expect(run(project, ["tidy", "apply"], { snapshot: batch.snapshot }).revision).toBe(
    applied.revision,
  );
});

test("legacy snapshot fields remain readable and hashless snapshots allow only an applied retry", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "An observation prepared by the previous format.");
  const batch = run(project, ["tidy", "prepare"]);
  const location = run(project, ["location"]);
  const snapshotPath = join(location.projectDirectory, "tidy-snapshots", `${batch.snapshot}.json`);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const hashes = snapshot.hashes;
  snapshot.cursor = { memory: {}, checkpoint: {}, note: { storage: 1 } };
  snapshot.refs = [note.ref];
  delete snapshot.hashes;
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const rejected = invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  expect(rejected.status).toBe(1);
  expect(run(project, ["tidy", "status"]).revision).toBe(0);
  snapshot.hashes = hashes;
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const applied = run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  expect(applied.cursor).toStrictEqual(snapshot.cursor);
  delete snapshot.hashes;
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  expect(run(project, ["tidy", "apply"], { snapshot: batch.snapshot }).revision).toBe(
    applied.revision,
  );
  expect(run(project, ["recall", "--work", "storage"]).pending).toStrictEqual([]);
});

test("legacy revisions remain readable and searchable during incremental adoption", (t) => {
  const project = fixture(t);
  const legacy = {
    expectedRevision: 0,
    scope: { type: "project" },
    text: "Use a Git-tracked memory file.",
    reason: "An initial proposal.",
    source: { type: "user", reference: "Earlier agreement" },
  };
  run(project, ["remember", "--id", "location"], legacy);
  run(project, ["remember", "--id", "location"], {
    ...legacy,
    expectedRevision: 1,
    text: "사용자 데이터 경로에 기억을 저장한다.",
    reason: "워크트리 삭제에 대비한다.",
  });
  const batch = run(project, ["tidy", "prepare", "--limit", "1"]);
  expect(batch.records[0].ref).toBe("memory:location@1");
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  expect(run(project, ["tidy", "prepare"]).records[0].ref).toBe("memory:location@2");
  expect(run(project, ["read", "--ref", "memory:location@1"]).text).toBe(legacy.text);
  const results = run(project, ["search", "--query", "기억 저장", "--limit", "5"]).results;
  expect(results[0].ref).toBe("memory:location@2");
  expect(results[0].score > 0).toBeTruthy();
  expect(run(project, ["search", "--query", "Git-tracked"]).results[0].ref).toBe(
    "memory:location@1",
  );
  expect(invoke(project, ["read", "--ref", "memory:../outside@1"]).status).toBe(1);
});

test("a partial tidy preserves existing agreements and leaves unreviewed originals pending", (t) => {
  const project = fixture(t);
  const original = {
    expectedRevision: 0,
    scope: { type: "project" },
    reason: "User agreement.",
    source: { type: "user", reference: "User message" },
  };
  run(project, ["remember", "--id", "first"], { ...original, text: "First constraint." });
  run(project, ["remember", "--id", "second"], {
    ...original,
    text: "Another constraint must remain visible.",
  });
  const batch = run(project, ["tidy", "prepare", "--limit", "1"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [memory("first", "First constraint.", [batch.records[0].ref])],
  });
  const resumed = run(project, ["recall"]);
  expect(resumed.memories.map(({ id }: { id: string }) => id).sort()).toStrictEqual([
    "first",
    "second",
  ]);
  expect(resumed.pending.map(({ ref }: { ref: string }) => ref)).toStrictEqual(["memory:second@1"]);
});

test("a tidy with no changes preserves existing memories and exposes their original sources", (t) => {
  const project = fixture(t);
  const original = {
    expectedRevision: 0,
    scope: { type: "project" },
    text: "Keep this agreement.",
    reason: "The agreement still applies.",
    source: { type: "user", reference: "User message" },
  };
  run(project, ["remember", "--id", "current-rule"], original);
  const batch = run(project, ["tidy", "prepare"]);
  expect(batch.current.memories[0]?.id).toBe("current-rule");
  expect(batch.current.memories[0].sources).toStrictEqual(["memory:current-rule@1"]);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  const recalled = run(project, ["recall"]);
  expect(recalled.memories[0]?.text).toBe(original.text);
  expect(recalled.pending).toStrictEqual([]);
  expect(recalled.tidy.pendingRecords).toBe(0);
  expect(run(project, ["read", "--ref", "memory:current-rule@1"]).text).toBe(original.text);
});

test("legacy adoption preserves the latest value known to prepare and leaves later changes pending", (t) => {
  const project = fixture(t);
  const original = {
    expectedRevision: 0,
    scope: { type: "project" },
    text: "First agreement.",
    reason: "User agreement.",
    source: { type: "user", reference: "User message" },
  };
  run(project, ["remember", "--id", "current-rule"], original);
  run(project, ["remember", "--id", "current-rule"], {
    ...original,
    expectedRevision: 1,
    text: "Current agreement.",
  });
  const batch = run(project, ["tidy", "prepare", "--limit", "2"]);
  run(project, ["remember", "--id", "current-rule"], {
    ...original,
    expectedRevision: 2,
    text: "Later agreement.",
  });
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  const recalled = run(project, ["recall"]);
  expect(recalled.memories[0]?.text).toBe("Current agreement.");
  expect(recalled.memories[0].sources).toStrictEqual(["memory:current-rule@2"]);
  expect(recalled.pending.map(({ ref }: { ref: string }) => ref)).toStrictEqual([
    "memory:current-rule@3",
  ]);
  expect(recalled.tidy.pendingRecords).toBe(1);
});

test("a legacy memory can be explicitly retired during the first tidy", (t) => {
  const project = fixture(t);
  run(project, ["remember", "--id", "old-rule"], {
    expectedRevision: 0,
    scope: { type: "project" },
    text: "An obsolete agreement.",
    reason: "Earlier constraint.",
    source: { type: "user", reference: "Earlier message" },
  });
  const note = record(project, "storage", "The previous constraint no longer applies.");
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    retire: [{ id: "old-rule", reason: note.text, sources: [note.ref] }],
  });
  expect(run(project, ["recall"]).memories).toStrictEqual([]);
  expect(run(project, ["read", "--ref", "memory:old-rule@1"]).text).toBe("An obsolete agreement.");
});

test("empty and read-only commands do not create data, and invalid daily input is rejected", (t) => {
  const project = fixture(t);
  expect(run(project, ["tidy", "prepare"]).snapshot).toBe(null);
  expect(run(project, ["tidy", "status"]).pendingRecords).toBe(0);
  expect(run(project, ["search", "--query", "missing"]).results).toStrictEqual([]);
  expect(invoke(project, ["record", "--work", "first", "--source", "User"], " ").status).toBe(1);
  expect(invoke(project, ["record", "--work", "first", "--source", " "], "A fact.").status).toBe(1);
  expect(existsSync(project.directory)).toBe(false);
});

test("tidy cannot cite new arrivals or mark unsupported completion, and scope stays immutable", (t) => {
  const project = fixture(t);
  const first = record(project, "first", "An experiment is still running.");
  const batch = run(project, ["tidy", "prepare"]);
  const later = record(project, "first", "A later result.");
  expect(
    invoke(project, ["tidy", "apply"], {
      snapshot: batch.snapshot,
      memories: [memory("claim", "A premature claim.", [later.ref])],
    }).status,
  ).toBe(1);
  expect(
    invoke(project, ["tidy", "apply"], {
      snapshot: batch.snapshot,
      works: [
        {
          id: "first",
          goal: "Run the experiment.",
          status: "complete",
          progress: "Claimed completion.",
          evidence: [],
          next: [],
          sources: [first.ref],
        },
      ],
    }).status,
  ).toBe(1);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [memory("claim", first.text, [first.ref], { scope: { type: "work", id: "first" } })],
  });
  const next = run(project, ["tidy", "prepare"]);
  expect(
    invoke(project, ["tidy", "apply"], {
      snapshot: next.snapshot,
      memories: [memory("claim", "Promoted by changing scope.", [later.ref])],
    }).status,
  ).toBe(1);
  expect(run(project, ["recall", "--work", "first"]).pending.length).toBe(1);
});

test("retiring a derived memory preserves its original source and unrelated memories", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "A shared constraint.");
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [memory("first", note.text, [note.ref]), memory("duplicate", note.text, [note.ref])],
  });
  const merge = record(project, "storage", "The two entries express one constraint.");
  const next = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: next.snapshot,
    retire: [{ id: "duplicate", reason: "Merged into first.", sources: [merge.ref] }],
  });
  expect(run(project, ["recall"]).memories.map(({ id }: { id: string }) => id)).toStrictEqual([
    "first",
  ]);
  expect(run(project, ["read", "--ref", note.ref]).text).toBe(note.text);
});

test("forget removes dependent derived memories from every tidy revision and rejects stale drafts", (t) => {
  const project = fixture(t);
  run(project, ["remember", "--id", "secret"], {
    expectedRevision: 0,
    scope: { type: "project" },
    text: "A value to forget.",
    reason: "User supplied it.",
    source: { type: "user", reference: "User message" },
  });
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [memory("derived-secret", "A value to forget.", ["memory:secret@1"])],
  });
  record(project, "storage", "A later observation.");
  const later = run(project, ["tidy", "prepare"]);
  const location = run(project, ["location"]);
  run(project, ["forget", "--id", "secret", "--revision", "1"]);
  expect(run(project, ["recall"]).memories).toStrictEqual([]);
  const stored = readFileSync(join(location.projectDirectory, "tidy.json"), "utf8");
  expect(stored.includes("A value to forget.")).toBe(false);
  const stale = invoke(project, ["tidy", "apply"], {
    snapshot: later.snapshot,
    memories: [memory("derived-secret", "A value to forget.", ["memory:secret@1"])],
  });
  expect(stale.status).toBe(1);
});

test("forgetting a daily original erases its content and dependent summaries and blocks retries", (t) => {
  const project = fixture(t);
  const note = record(
    project,
    "storage",
    "Sensitive observation to erase.",
    "Private source to erase.",
  );
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [memory("derived", note.text, [note.ref])],
  });
  run(project, ["forget", "--ref", note.ref]);
  expect(invoke(project, ["read", "--ref", note.ref]).status).toBe(1);
  expect(
    invoke(
      project,
      ["record", "--work", "storage", "--source", note.source.reference, "--key", note.requestKey],
      note.text,
    ).status,
  ).toBe(1);
  expect(run(project, ["recall"]).memories).toStrictEqual([]);
  const location = run(project, ["location"]);
  for (const path of ["tidy.json", "works/storage/notes.json"]) {
    expect(readFileSync(join(location.projectDirectory, path), "utf8").includes(note.text)).toBe(
      false,
    );
  }
  expect(run(project, ["search", "--query", "Sensitive observation"]).results).toStrictEqual([]);
});

test("erasing a superseded source preserves the current memory and removes only its historical link", (t) => {
  const project = fixture(t);
  const old = record(project, "storage", "Use method A.");
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [memory("current-method", old.text, [old.ref])],
  });
  const replacement = record(project, "storage", "Use method B.");
  const next = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: next.snapshot,
    memories: [
      memory("current-method", replacement.text, [replacement.ref], { supersedes: [old.ref] }),
    ],
  });
  run(project, ["forget", "--ref", old.ref]);
  const recalled = run(project, ["recall", "--history"]);
  expect(recalled.memories[0]?.text).toBe(replacement.text);
  expect(recalled.memories[0].sources).toStrictEqual([replacement.ref]);
  expect(recalled.memories[0].supersedes).toStrictEqual([]);
  expect(recalled.pending).toStrictEqual([]);
  const location = run(project, ["location"]);
  const stored = readFileSync(join(location.projectDirectory, "tidy.json"), "utf8");
  expect(stored.includes(old.text)).toBe(false);
  expect(stored.includes(old.ref)).toBe(false);
  expect(run(project, ["read", "--ref", replacement.ref]).text).toBe(replacement.text);
});

// The CLI waits five seconds before rejecting a held lock.
test(
  "original deletion waits for the tidy lock even before the first consolidation",
  { timeout: 10000 },
  (t) => {
    const project = fixture(t);
    const note = record(project, "storage", "An observation to erase.");
    const batch = run(project, ["tidy", "prepare"]);
    const location = run(project, ["location"]);
    const lockPath = join(location.projectDirectory, "tidy.json.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), { flag: "wx" });
    try {
      const deletion = invoke(project, ["forget", "--ref", note.ref]);
      expect(deletion.status).toBe(1);
      expect(deletion.stderr).toMatch(/locked/);
      expect(run(project, ["read", "--ref", note.ref]).text).toBe(note.text);
      expect(record(project, "other", "Independent daily writes still work.").ref).toBe(
        "note:other@1",
      );
    } finally {
      rmSync(lockPath);
    }
    run(project, ["forget", "--ref", note.ref]);
    const applied = invoke(project, ["tidy", "apply"], {
      snapshot: batch.snapshot,
      memories: [memory("erased", note.text, [note.ref])],
    });
    expect(applied.status).toBe(1);
    expect(existsSync(join(location.projectDirectory, "tidy.json"))).toBe(false);
  },
);

test("erasing a prepared original invalidates the draft before the first consolidation", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "An observation later erased.");
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["forget", "--ref", note.ref]);
  const applied = invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  expect(applied.status).toBe(1);
  expect(applied.stderr).toMatch(/changed|forgotten/i);
  expect(run(project, ["tidy", "status"]).revision).toBe(0);
});

test("a new legacy revision does not invalidate an unchanged original in an in-flight batch", (t) => {
  const project = fixture(t);
  const original = {
    expectedRevision: 0,
    scope: { type: "project" },
    text: "First value.",
    reason: "Initial agreement.",
    source: { type: "user", reference: "User message" },
  };
  run(project, ["remember", "--id", "value"], original);
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["remember", "--id", "value"], {
    ...original,
    expectedRevision: 1,
    text: "Later value.",
  });
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [memory("value", original.text, ["memory:value@1"])],
  });
  expect(run(project, ["recall"]).pending[0].ref).toBe("memory:value@2");
});

test("archive search can cross work boundaries, while an explicit work scope narrows it", (t) => {
  const project = fixture(t);
  const first = record(project, "first", "A storage constraint.");
  const second = record(project, "second", "Another storage constraint.");
  const all = run(project, ["search", "--query", "storage"]).results.map(
    ({ ref }: { ref: string }) => ref,
  );
  expect(new Set(all)).toStrictEqual(new Set([first.ref, second.ref]));
  expect(
    run(project, ["search", "--query", "storage", "--work", "first"]).results.map(
      ({ ref }: { ref: string }) => ref,
    ),
  ).toStrictEqual([first.ref]);
});

function concurrent(project: Fixture, work: string, text: string) {
  return concurrentRequest(project, ["record", "--work", work, "--source", text], text);
}

test("concurrent daily writers preserve all observations without sharing work state", async (t) => {
  const project = fixture(t);
  const writes = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      concurrent(project, i % 2 ? "first" : "second", `Observation ${i}`),
    ),
  );
  for (const write of writes) expect(write.status, write.stderr).toBe(0);
  const first = run(project, ["recall", "--work", "first"]);
  const second = run(project, ["recall", "--work", "second"]);
  expect(first.pending.length).toBe(4);
  expect(second.pending.length).toBe(4);
  expect(
    new Set([...first.pending, ...second.pending].map(({ ref }: { ref: string }) => ref)).size,
  ).toBe(8);
});

test("concurrent tidy writers have one winner instead of overwriting each other's interpretation", async (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "One original observation.");
  const first = run(project, ["tidy", "prepare"]);
  const second = run(project, ["tidy", "prepare"]);
  const writes = await Promise.all(
    [first, second].map((batch, i) =>
      concurrentRequest(project, ["tidy", "apply"], {
        snapshot: batch.snapshot,
        memories: [memory("observation", `Interpretation ${i}`, [note.ref])],
      }),
    ),
  );
  expect(writes.map(({ status }) => status).sort()).toStrictEqual([0, 1]);
  expect(run(project, ["tidy", "status"]).revision).toBe(1);
  expect(run(project, ["read", "--ref", note.ref]).text).toBe(note.text);
});
