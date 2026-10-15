import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { calculateTidyStatus } from "./tidy.mjs";

const cliPath = fileURLToPath(new URL("cli.mjs", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "loom-tidy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet");
  git(repo, "-c", "user.name=Loom Test", "-c", "user.email=test@example.invalid",
    "commit", "--quiet", "--allow-empty", "-m", "fixture");
  return { root, repo, directory: join(root, "records") };
}

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function invoke(project, args, input, cwd = project.repo) {
  return spawnSync(process.execPath, [cliPath, ...args, "--cwd", cwd,
    "--data-dir", project.directory], {
    encoding: "utf8", input: typeof input === "object" ? JSON.stringify(input) : input,
  });
}

function run(project, args, input, cwd) {
  const result = invoke(project, args, input, cwd);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function record(project, work, text, source = text) {
  return run(project, ["record", "--work", work, "--source", source], text);
}

function memory(id, text, sources, overrides = {}) {
  return { id, scope: { type: "project" }, text,
    reason: "A reusable constraint supported by the cited records.", sources, ...overrides };
}

test("daily text records survive worktree removal without rewriting a checkpoint", (t) => {
  const project = fixture(t);
  const worktree = join(project.root, "worktree");
  git(project.repo, "worktree", "add", "--quiet", "--detach", worktree);
  const args = ["record", "--work", "storage", "--source", "User: preserve context outside checkouts",
    "--by", "user"];
  const saved = run(project, args, "워크트리 삭제 후에도 기억을 보존한다.", worktree);
  assert.equal(saved.ref, "note:storage@1");
  assert.equal(saved.source.type, "user");
  assert.deepEqual(run(project, [...args, "--key", saved.requestKey], saved.text, worktree), saved);
  git(project.repo, "worktree", "remove", worktree);
  const resumed = run(project, ["recall", "--work", "storage"]);
  assert.equal(resumed.pending[0].text, saved.text);
  assert.equal(resumed.work, null);
  assert.equal(run(project, ["recall", "--work", "unrelated"]).pending.length, 0);
  assert.equal(git(project.repo, "status", "--porcelain"), "");
  assert.equal(existsSync(join(project.repo, "notes.json")), false);
});

test("a repeated observation is a new event, while a retry uses its original request key", (t) => {
  const project = fixture(t);
  const first = record(project, "storage", "The same check passed.", "yarn test");
  const second = record(project, "storage", "The same check passed.", "yarn test");
  assert.notEqual(first.ref, second.ref);
  const args = ["record", "--work", "storage", "--source", "yarn test", "--key", first.requestKey];
  assert.deepEqual(run(project, args, first.text), first);
  assert.equal(invoke(project, args, "Different content for the same request.").status, 1);
  assert.equal(run(project, ["recall", "--work", "storage"]).pending.length, 2);
});

test("tidy publishes grounded changes while preserving raw records, other work, and new arrivals", (t) => {
  const project = fixture(t);
  const old = record(project, "storage", "Use a temporary JSON input file.", "Experiment A");
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [memory("input-method", old.text, [old.ref])],
    works: [{ id: "storage", goal: "Save context without checkout changes.", status: "active",
      progress: "An initial input path was tried.", evidence: [old.ref],
      next: ["Check whether input files appear in the change list."], sources: [old.ref] }],
  });
  const other = record(project, "other", "Keep the graph experiment isolated.", "User: separate task");
  const next = record(project, "storage", "Input files appear in changes; send plain text through stdin.",
    "Observed change list and user agreement");
  const second = run(project, ["tidy", "prepare"]);
  const arrived = record(project, "storage", "Windows execution still needs a native check.", "Verification boundary");
  const submission = {
    snapshot: second.snapshot,
    memories: [memory("input-method", "Send daily records through stdin.", [next.ref],
      { supersedes: [old.ref] })],
    works: [{ id: "other", goal: "Run an isolated graph experiment.", status: "active",
      progress: other.text, evidence: [other.ref], next: ["Compare the next run."], sources: [other.ref] }],
  };
  const published = run(project, ["tidy", "apply"], submission);
  assert.equal(published.revision, 2);
  assert.equal(run(project, ["tidy", "apply"], submission).revision, 2);
  const resumed = run(project, ["recall", "--work", "storage"]);
  assert.equal(resumed.memories[0].text, "Send daily records through stdin.");
  assert.deepEqual(resumed.memories[0].supersedes, [old.ref]);
  assert.equal(resumed.work.goal, "Save context without checkout changes.");
  assert.deepEqual(resumed.pending.map(({ ref }) => ref), [arrived.ref]);
  assert.equal(run(project, ["read", "--ref", old.ref]).text, old.text);
  assert.equal(run(project, ["recall", "--work", "other"]).work.progress, other.text);
  assert.equal(git(project.repo, "status", "--porcelain"), "");
});

test("invalid provenance and stale tidy snapshots do not advance the processed range", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "Store outside the checkout.");
  const first = run(project, ["tidy", "prepare"]);
  const second = run(project, ["tidy", "prepare"]);
  const invalid = invoke(project, ["tidy", "apply"], {
    snapshot: first.snapshot, memories: [memory("location", "Invented fact.", ["note:storage@99"])],
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /source|reference|snapshot/i);
  assert.equal(run(project, ["recall", "--work", "storage"]).pending.length, 1);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot, memories: [memory("location", note.text, [note.ref])],
  });
  const stale = invoke(project, ["tidy", "apply"], {
    snapshot: second.snapshot, memories: [memory("location", "A stale replacement.", [note.ref])],
  });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /conflict|stale/i);
  assert.equal(run(project, ["recall"]).memories[0].text, note.text);
});

test("tidy projects its changes without carrying unrelated input metadata into recalled state", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "A verified observation.");
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot, metadata: "Caller-only metadata.",
    memories: [memory("location", note.text, [note.ref], { metadata: "Caller-only metadata." })],
    works: [{ id: "storage", goal: "Preserve context.", status: "active", progress: note.text,
      evidence: [note.ref], next: ["Check the next observation."], sources: [note.ref],
      metadata: "Caller-only metadata." }] });
  const recalled = run(project, ["recall", "--work", "storage"]);
  assert.equal(recalled.memories[0].text, note.text);
  assert.equal(recalled.work.progress, note.text);
  assert.equal(Object.hasOwn(recalled.memories[0], "metadata"), false);
  assert.equal(Object.hasOwn(recalled.work, "metadata"), false);
  assert.deepEqual(recalled.pending, []);
});

test("bounded tidy batches never skip remaining records or convert uncertainty into agreement", (t) => {
  const project = fixture(t);
  const notes = ["A choice is proposed.", "The choice is disputed.", "An experiment remains inconclusive."]
    .map((text) => record(project, "experiment", text));
  const first = run(project, ["tidy", "prepare", "--limit", "2"]);
  assert.deepEqual(first.records.map(({ ref }) => ref), notes.slice(0, 2).map(({ ref }) => ref));
  assert.equal(first.remaining, 1);
  run(project, ["tidy", "apply"], {
    snapshot: first.snapshot,
    memories: [memory("open-choice", "The choice remains unresolved.", [notes[0].ref, notes[1].ref],
      { scope: { type: "work", id: "experiment" }, status: "unresolved" })],
  });
  assert.deepEqual(run(project, ["recall"]).memories, []);
  const resumed = run(project, ["recall", "--work", "experiment"]);
  assert.equal(resumed.memories[0].status, "unresolved");
  assert.deepEqual(resumed.pending.map(({ ref }) => ref), [notes[2].ref]);
  assert.deepEqual(run(project, ["tidy", "prepare"]).records.map(({ ref }) => ref), [notes[2].ref]);
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
  assert.equal(Object.hasOwn(snapshot, "cursor"), false);
  assert.equal(Object.hasOwn(snapshot, "refs"), false);
  assert.deepEqual(Object.keys(snapshot.hashes), prepared.slice(0, 2).map(({ ref }) => ref));
  snapshot.hashes = Object.fromEntries(Object.entries(snapshot.hashes).reverse());
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const arrived = record(project, "storage", "Arrived after preparation.");
  const applied = run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  assert.deepEqual(applied.cursor, { memory: {}, checkpoint: {}, note: { earlier: 1, storage: 2 } });
  assert.deepEqual(run(project, ["recall", "--work", "storage"]).pending.map(({ ref }) => ref),
    [prepared[2].ref, arrived.ref]);
  assert.equal(run(project, ["tidy", "apply"], { snapshot: batch.snapshot }).revision, applied.revision);
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
  assert.equal(rejected.status, 1);
  assert.equal(run(project, ["tidy", "status"]).revision, 0);
  snapshot.hashes = hashes;
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const applied = run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  assert.deepEqual(applied.cursor, snapshot.cursor);
  delete snapshot.hashes;
  writeFileSync(snapshotPath, JSON.stringify(snapshot));
  assert.equal(run(project, ["tidy", "apply"], { snapshot: batch.snapshot }).revision, applied.revision);
  assert.deepEqual(run(project, ["recall", "--work", "storage"]).pending, []);
});

test("legacy revisions remain readable and searchable during incremental adoption", (t) => {
  const project = fixture(t);
  const legacy = { expectedRevision: 0, scope: { type: "project" }, text: "Use a Git-tracked memory file.",
    reason: "An initial proposal.", source: { type: "user", reference: "Earlier agreement" } };
  run(project, ["remember", "--id", "location"], legacy);
  run(project, ["remember", "--id", "location"], {
    ...legacy, expectedRevision: 1, text: "사용자 데이터 경로에 기억을 저장한다.", reason: "워크트리 삭제에 대비한다.",
  });
  const batch = run(project, ["tidy", "prepare", "--limit", "1"]);
  assert.equal(batch.records[0].ref, "memory:location@1");
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  assert.equal(run(project, ["tidy", "prepare"]).records[0].ref, "memory:location@2");
  assert.equal(run(project, ["read", "--ref", "memory:location@1"]).text, legacy.text);
  const results = run(project, ["search", "--query", "기억 저장", "--limit", "5"]).results;
  assert.equal(results[0].ref, "memory:location@2");
  assert.ok(results[0].score > 0);
  assert.equal(run(project, ["search", "--query", "Git-tracked"]).results[0].ref, "memory:location@1");
  assert.equal(invoke(project, ["read", "--ref", "memory:../outside@1"]).status, 1);
});

test("a partial tidy preserves existing agreements and leaves unreviewed originals pending", (t) => {
  const project = fixture(t);
  const original = { expectedRevision: 0, scope: { type: "project" }, reason: "User agreement.",
    source: { type: "user", reference: "User message" } };
  run(project, ["remember", "--id", "first"], { ...original, text: "First constraint." });
  run(project, ["remember", "--id", "second"], { ...original, text: "Another constraint must remain visible." });
  const batch = run(project, ["tidy", "prepare", "--limit", "1"]);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot,
    memories: [memory("first", "First constraint.", [batch.records[0].ref])] });
  const resumed = run(project, ["recall"]);
  assert.deepEqual(resumed.memories.map(({ id }) => id).sort(), ["first", "second"]);
  assert.deepEqual(resumed.pending.map(({ ref }) => ref), ["memory:second@1"]);
});

test("a tidy with no changes preserves existing memories and exposes their original sources", (t) => {
  const project = fixture(t);
  const original = { expectedRevision: 0, scope: { type: "project" }, text: "Keep this agreement.",
    reason: "The agreement still applies.", source: { type: "user", reference: "User message" } };
  run(project, ["remember", "--id", "current-rule"], original);
  const batch = run(project, ["tidy", "prepare"]);
  assert.equal(batch.current.memories[0]?.id, "current-rule");
  assert.deepEqual(batch.current.memories[0].sources, ["memory:current-rule@1"]);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  const recalled = run(project, ["recall"]);
  assert.equal(recalled.memories[0]?.text, original.text);
  assert.deepEqual(recalled.pending, []);
  assert.equal(recalled.tidy.pendingRecords, 0);
  assert.equal(run(project, ["read", "--ref", "memory:current-rule@1"]).text, original.text);
});

test("legacy adoption preserves the latest value known to prepare and leaves later changes pending", (t) => {
  const project = fixture(t);
  const original = { expectedRevision: 0, scope: { type: "project" }, text: "First agreement.",
    reason: "User agreement.", source: { type: "user", reference: "User message" } };
  run(project, ["remember", "--id", "current-rule"], original);
  run(project, ["remember", "--id", "current-rule"], { ...original, expectedRevision: 1, text: "Current agreement." });
  const batch = run(project, ["tidy", "prepare", "--limit", "2"]);
  run(project, ["remember", "--id", "current-rule"], { ...original, expectedRevision: 2, text: "Later agreement." });
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  const recalled = run(project, ["recall"]);
  assert.equal(recalled.memories[0]?.text, "Current agreement.");
  assert.deepEqual(recalled.memories[0].sources, ["memory:current-rule@2"]);
  assert.deepEqual(recalled.pending.map(({ ref }) => ref), ["memory:current-rule@3"]);
  assert.equal(recalled.tidy.pendingRecords, 1);
});

test("a legacy memory can be explicitly retired during the first tidy", (t) => {
  const project = fixture(t);
  run(project, ["remember", "--id", "old-rule"], { expectedRevision: 0, scope: { type: "project" },
    text: "An obsolete agreement.", reason: "Earlier constraint.", source: { type: "user", reference: "Earlier message" } });
  const note = record(project, "storage", "The previous constraint no longer applies.");
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot,
    retire: [{ id: "old-rule", reason: note.text, sources: [note.ref] }] });
  assert.deepEqual(run(project, ["recall"]).memories, []);
  assert.equal(run(project, ["read", "--ref", "memory:old-rule@1"]).text, "An obsolete agreement.");
});

test("empty and read-only commands do not create data, and invalid daily input is rejected", (t) => {
  const project = fixture(t);
  assert.equal(run(project, ["tidy", "prepare"]).snapshot, null);
  assert.equal(run(project, ["tidy", "status"]).pendingRecords, 0);
  assert.deepEqual(run(project, ["search", "--query", "missing"]).results, []);
  assert.equal(invoke(project, ["record", "--work", "first", "--source", "User"], " ").status, 1);
  assert.equal(invoke(project, ["record", "--work", "first", "--source", " "], "A fact.").status, 1);
  assert.equal(existsSync(project.directory), false);
});

test("tidy cannot cite new arrivals or mark unsupported completion, and scope stays immutable", (t) => {
  const project = fixture(t);
  const first = record(project, "first", "An experiment is still running.");
  const batch = run(project, ["tidy", "prepare"]);
  const later = record(project, "first", "A later result.");
  assert.equal(invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot,
    memories: [memory("claim", "A premature claim.", [later.ref])] }).status, 1);
  assert.equal(invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot,
    works: [{ id: "first", goal: "Run the experiment.", status: "complete", progress: "Claimed completion.",
      evidence: [], next: [], sources: [first.ref] }] }).status, 1);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot,
    memories: [memory("claim", first.text, [first.ref], { scope: { type: "work", id: "first" } })] });
  const next = run(project, ["tidy", "prepare"]);
  assert.equal(invoke(project, ["tidy", "apply"], { snapshot: next.snapshot,
    memories: [memory("claim", "Promoted by changing scope.", [later.ref])] }).status, 1);
  assert.equal(run(project, ["recall", "--work", "first"]).pending.length, 1);
});

test("retiring a derived memory preserves its original source and unrelated memories", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "A shared constraint.");
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: first.snapshot,
    memories: [memory("first", note.text, [note.ref]), memory("duplicate", note.text, [note.ref])] });
  const merge = record(project, "storage", "The two entries express one constraint.");
  const next = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: next.snapshot,
    retire: [{ id: "duplicate", reason: "Merged into first.", sources: [merge.ref] }] });
  assert.deepEqual(run(project, ["recall"]).memories.map(({ id }) => id), ["first"]);
  assert.equal(run(project, ["read", "--ref", note.ref]).text, note.text);
});

test("forget removes dependent derived memories from every tidy revision and rejects stale drafts", (t) => {
  const project = fixture(t);
  run(project, ["remember", "--id", "secret"], {
    expectedRevision: 0, scope: { type: "project" }, text: "A value to forget.",
    reason: "User supplied it.", source: { type: "user", reference: "User message" },
  });
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: first.snapshot,
    memories: [memory("derived-secret", "A value to forget.", ["memory:secret@1"])] });
  record(project, "storage", "A later observation.");
  const later = run(project, ["tidy", "prepare"]);
  const location = run(project, ["location"]);
  run(project, ["forget", "--id", "secret", "--revision", "1"]);
  assert.deepEqual(run(project, ["recall"]).memories, []);
  const stored = readFileSync(join(location.projectDirectory, "tidy.json"), "utf8");
  assert.equal(stored.includes("A value to forget."), false);
  const stale = invoke(project, ["tidy", "apply"], { snapshot: later.snapshot,
    memories: [memory("derived-secret", "A value to forget.", ["memory:secret@1"])] });
  assert.equal(stale.status, 1);
});

test("forgetting a daily original erases its content and dependent summaries and blocks retries", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "Sensitive observation to erase.", "Private source to erase.");
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot,
    memories: [memory("derived", note.text, [note.ref])] });
  run(project, ["forget", "--ref", note.ref]);
  assert.equal(invoke(project, ["read", "--ref", note.ref]).status, 1);
  assert.equal(invoke(project, ["record", "--work", "storage", "--source", note.source.reference,
    "--key", note.requestKey], note.text).status, 1);
  assert.deepEqual(run(project, ["recall"]).memories, []);
  const location = run(project, ["location"]);
  for (const path of ["tidy.json", "works/storage/notes.json"]) {
    assert.equal(readFileSync(join(location.projectDirectory, path), "utf8").includes(note.text), false);
  }
  assert.deepEqual(run(project, ["search", "--query", "Sensitive observation"]).results, []);
});

test("erasing a superseded source preserves the current memory and removes only its historical link", (t) => {
  const project = fixture(t);
  const old = record(project, "storage", "Use method A.");
  const first = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: first.snapshot,
    memories: [memory("current-method", old.text, [old.ref])] });
  const replacement = record(project, "storage", "Use method B.");
  const next = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], { snapshot: next.snapshot,
    memories: [memory("current-method", replacement.text, [replacement.ref], { supersedes: [old.ref] })] });
  run(project, ["forget", "--ref", old.ref]);
  const recalled = run(project, ["recall", "--history"]);
  assert.equal(recalled.memories[0]?.text, replacement.text);
  assert.deepEqual(recalled.memories[0].sources, [replacement.ref]);
  assert.deepEqual(recalled.memories[0].supersedes, []);
  assert.deepEqual(recalled.pending, []);
  const location = run(project, ["location"]);
  const stored = readFileSync(join(location.projectDirectory, "tidy.json"), "utf8");
  assert.equal(stored.includes(old.text), false);
  assert.equal(stored.includes(old.ref), false);
  assert.equal(run(project, ["read", "--ref", replacement.ref]).text, replacement.text);
});

test("original deletion waits for the tidy lock even before the first consolidation", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "An observation to erase.");
  const batch = run(project, ["tidy", "prepare"]);
  const location = run(project, ["location"]);
  const lockPath = join(location.projectDirectory, "tidy.json.lock");
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  try {
    const deletion = invoke(project, ["forget", "--ref", note.ref]);
    assert.equal(deletion.status, 1);
    assert.match(deletion.stderr, /locked/);
    assert.equal(run(project, ["read", "--ref", note.ref]).text, note.text);
    assert.equal(record(project, "other", "Independent daily writes still work.").ref, "note:other@1");
  } finally {
    rmSync(lockPath);
  }
  run(project, ["forget", "--ref", note.ref]);
  const applied = invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot,
    memories: [memory("erased", note.text, [note.ref])] });
  assert.equal(applied.status, 1);
  assert.equal(existsSync(join(location.projectDirectory, "tidy.json")), false);
});

test("erasing a prepared original invalidates the draft before the first consolidation", (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "An observation later erased.");
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["forget", "--ref", note.ref]);
  const applied = invoke(project, ["tidy", "apply"], { snapshot: batch.snapshot });
  assert.equal(applied.status, 1);
  assert.match(applied.stderr, /changed|forgotten/i);
  assert.equal(run(project, ["tidy", "status"]).revision, 0);
});

test("a new legacy revision does not invalidate an unchanged original in an in-flight batch", (t) => {
  const project = fixture(t);
  const original = { expectedRevision: 0, scope: { type: "project" }, text: "First value.",
    reason: "Initial agreement.", source: { type: "user", reference: "User message" } };
  run(project, ["remember", "--id", "value"], original);
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["remember", "--id", "value"], { ...original, expectedRevision: 1, text: "Later value." });
  run(project, ["tidy", "apply"], { snapshot: batch.snapshot,
    memories: [memory("value", original.text, ["memory:value@1"])] });
  assert.equal(run(project, ["recall"]).pending[0].ref, "memory:value@2");
});

test("tidy is due by pending volume or age while processed records do not trigger it", () => {
  const now = Date.UTC(2026, 9, 15, 9);
  const cursor = { memory: {}, checkpoint: {}, note: {} };
  const view = { revision: 0, cursor };
  const fresh = Array.from({ length: 20 }, (_, i) => ({ kind: "note", id: "ongoing",
    revision: i + 1, recordedAt: new Date(now - 1000).toISOString() }));
  assert.equal(calculateTidyStatus({ sources: fresh.slice(0, 19) }, view, now).due, false);
  assert.deepEqual(calculateTidyStatus({ sources: fresh }, view, now).reasons, ["record-count"]);
  const old = { ...fresh[0], recordedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() };
  assert.deepEqual(calculateTidyStatus({ sources: [old] }, view, now).reasons, ["age"]);
  assert.equal(calculateTidyStatus({ sources: [old] }, { revision: 1,
    cursor: { ...cursor, note: { ongoing: 1 } } }, now).due, false);
});

test("archive search can cross work boundaries, while an explicit work scope narrows it", (t) => {
  const project = fixture(t);
  const first = record(project, "first", "A storage constraint.");
  const second = record(project, "second", "Another storage constraint.");
  const all = run(project, ["search", "--query", "storage"]).results.map(({ ref }) => ref);
  assert.deepEqual(new Set(all), new Set([first.ref, second.ref]));
  assert.deepEqual(run(project, ["search", "--query", "storage", "--work", "first"])
    .results.map(({ ref }) => ref), [first.ref]);
});

function concurrent(project, work, text) {
  return concurrentRequest(project, ["record", "--work", work, "--source", text], text);
}

function concurrentRequest(project, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args, "--cwd", project.repo, "--data-dir", project.directory]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(typeof input === "object" ? JSON.stringify(input) : input);
  });
}

test("concurrent daily writers preserve all observations without sharing work state", async (t) => {
  const project = fixture(t);
  const writes = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    concurrent(project, i % 2 ? "first" : "second", `Observation ${i}`)));
  for (const write of writes) assert.equal(write.status, 0, write.stderr);
  const first = run(project, ["recall", "--work", "first"]);
  const second = run(project, ["recall", "--work", "second"]);
  assert.equal(first.pending.length, 4);
  assert.equal(second.pending.length, 4);
  assert.equal(new Set([...first.pending, ...second.pending].map(({ ref }) => ref)).size, 8);
});

test("concurrent tidy writers have one winner instead of overwriting each other's interpretation", async (t) => {
  const project = fixture(t);
  const note = record(project, "storage", "One original observation.");
  const first = run(project, ["tidy", "prepare"]);
  const second = run(project, ["tidy", "prepare"]);
  const writes = await Promise.all([first, second].map((batch, i) =>
    concurrentRequest(project, ["tidy", "apply"], { snapshot: batch.snapshot,
      memories: [memory("observation", `Interpretation ${i}`, [note.ref])] })));
  assert.deepEqual(writes.map(({ status }) => status).sort(), [0, 1]);
  assert.equal(run(project, ["tidy", "status"]).revision, 1);
  assert.equal(run(project, ["read", "--ref", note.ref]).text, note.text);
});
