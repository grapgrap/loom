import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, invoke, run } from "./testing.ts";

function rewriteStoredRecord(path: string, rewrite: (record: any) => void) {
  const record = JSON.parse(readFileSync(path, "utf8"));
  rewrite(record);
  const contents = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(path, contents);
  return contents;
}

test("recall rejects a stored numeric timestamp with file and field context without rewriting it", (t) => {
  const project = fixture(t);
  for (const work of ["alpha", "beta"]) {
    run(project, ["record", "--work", work, "--source", "Observed check"], `${work} observation`);
  }
  const location = run(project, ["location"]);
  const path = join(location.projectDirectory, "works", "alpha", "notes.json");
  const contents = rewriteStoredRecord(path, (record) => {
    record.revisions[0].recordedAt = 0;
  });
  const recalled = invoke(project, ["recall"]);
  expect(recalled.status).toBe(1);
  expect(recalled.stderr).toContain(`Invalid record at ${path}`);
  expect(recalled.stderr).toMatch(/recordedAt/);
  expect(recalled.stderr).not.toMatch(/localeCompare/);
  expect(readFileSync(path, "utf8")).toBe(contents);
  const appended = invoke(
    project,
    ["record", "--work", "alpha", "--source", "A later check"],
    "Later observation",
  );
  expect(appended.status).toBe(1);
  expect(appended.stderr).toContain(path);
  expect(appended.stderr).toMatch(/recordedAt/);
  expect(readFileSync(path, "utf8")).toBe(contents);
});

test.for(["note", "memory"] as const)(
  "recall rejects a stored non-Boolean forgotten value on a %s without hiding its content",
  (kind, t) => {
    const project = fixture(t);
    let path: string;
    if (kind === "note") {
      run(project, ["record", "--work", "alpha", "--source", "Observed check"], "Keep this note.");
      const location = run(project, ["location"]);
      path = join(location.projectDirectory, "works", "alpha", "notes.json");
    } else {
      run(project, ["remember", "--id", "policy"], {
        expectedRevision: 0,
        scope: { type: "project" },
        text: "Keep this policy.",
        reason: "A current constraint.",
        source: { type: "user", reference: "User agreement" },
      });
      const location = run(project, ["location"]);
      path = join(location.projectDirectory, "context", "policy.json");
    }
    const contents = rewriteStoredRecord(path, (record) => {
      const entry = kind === "note" ? record.revisions[0] : record;
      entry.forgotten = "false";
    });
    const recalled = invoke(project, ["recall"]);
    expect(recalled.status).toBe(1);
    expect(recalled.stderr).toContain(`Invalid record at ${path}`);
    expect(recalled.stderr).toMatch(/forgotten/);
    expect(readFileSync(path, "utf8")).toBe(contents);
  },
);

test("recall rejects nested saved source references instead of silently omitting a supported memory", (t) => {
  const project = fixture(t);
  const note = run(
    project,
    ["record", "--work", "policy", "--source", "User agreement"],
    "Keep this policy.",
  );
  const batch = run(project, ["tidy", "prepare"]);
  run(project, ["tidy", "apply"], {
    snapshot: batch.snapshot,
    memories: [
      {
        id: "policy",
        scope: { type: "project" },
        text: note.text,
        reason: "A current constraint.",
        sources: [note.ref],
      },
    ],
  });
  expect(run(project, ["recall"]).memories.map(({ id }: { id: string }) => id)).toStrictEqual([
    "policy",
  ]);
  const location = run(project, ["location"]);
  const path = join(location.projectDirectory, "tidy.json");
  const contents = rewriteStoredRecord(path, (record) => {
    record.revisions.at(-1).memories[0].sources = [[note.ref]];
  });
  const recalled = invoke(project, ["recall"]);
  expect(recalled.status).toBe(1);
  expect(recalled.stderr).toContain(`Invalid record at ${path}`);
  expect(recalled.stderr).toMatch(/reference.*string/);
  expect(readFileSync(path, "utf8")).toBe(contents);
});
