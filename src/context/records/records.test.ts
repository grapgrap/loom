import { expect, test } from "vitest";
import {
  parseMemoryInput,
  parseCheckpointInput,
  parseMemoryRecord,
  parseCheckpointRecord,
  validateRecordSource,
} from "./records.ts";

const memory = {
  expectedRevision: 0,
  scope: { type: "project" },
  text: "Keep the agreement.",
  reason: "It applies to later work.",
  source: { type: "user", reference: "User message" },
};

test("memory input identifies invalid fields before accepting a record", () => {
  for (const [input, field] of [
    [null, "memory"],
    [{ ...memory, text: 42 }, "text"],
    [{ ...memory, source: { type: "user" } }, "source.reference"],
    [{ ...memory, source: null }, "source"],
    [{ ...memory, scope: { type: "projects" } }, "scope.type"],
    [{ ...memory, scope: { type: "work" } }, "scope.id"],
  ] as const) {
    expect(() => parseMemoryInput(input)).toThrowError(
      expect.objectContaining({ name: "Error", message: expect.stringContaining(field) }),
    );
  }
  expect(() => validateRecordSource({ type: "observer", reference: "Observation" })).toThrowError(
    /source.type/,
  );
});

test("work input accepts only documented states and validates evidence and next steps", () => {
  const checkpoint = {
    expectedRevision: 0,
    goal: "Verify storage.",
    status: "active",
    progress: "Checks remain.",
    evidence: [],
    next: ["Run checks."],
    source: memory.source,
  };
  for (const [overrides, field] of [
    [{ status: "completed" }, "status"],
    [{ evidence: null }, "evidence"],
    [{ next: {} }, "next"],
  ] as const) {
    expect(() => parseCheckpointInput({ ...checkpoint, ...overrides })).toThrowError(
      expect.objectContaining({ name: "Error", message: expect.stringContaining(field) }),
    );
  }
  expect(() => parseCheckpointInput({ ...checkpoint, status: "complete" })).toThrowError(
    /evidence/,
  );
  expect(
    parseCheckpointInput({
      ...checkpoint,
      status: "complete",
      evidence: ["Checks passed"],
      next: [],
    }).status,
  ).toBe("complete");
});

const recordedAt = "2026-10-15T12:00:00.000Z";
const storedMemory = {
  version: 1,
  id: "agreement",
  scope: memory.scope,
  revisions: [
    {
      revision: 1,
      recordedAt,
      text: memory.text,
      reason: memory.reason,
      source: memory.source,
    },
  ],
};
const storedCheckpoint = {
  version: 1,
  id: "storage",
  revisions: [
    {
      revision: 1,
      recordedAt,
      goal: "Verify storage.",
      status: "active",
      progress: "Checks remain.",
      evidence: [],
      next: ["Run checks."],
      source: memory.source,
    },
  ],
};

test("stored memory and checkpoint histories reject non-string timestamps", () => {
  for (const timestamp of [0, [0], null, {}]) {
    for (const [parse, record] of [
      [parseMemoryRecord, storedMemory],
      [parseCheckpointRecord, storedCheckpoint],
    ] as const) {
      const input = {
        ...record,
        revisions: [{ ...record.revisions[0], recordedAt: timestamp }],
      };
      expect(() => parse(input)).toThrowError(/recordedAt/);
    }
  }
});

test("stored memories reject non-Boolean forgotten values instead of hiding live content", () => {
  for (const forgotten of ["false", 0, 1, null, [], {}]) {
    expect(() => parseMemoryRecord({ ...storedMemory, forgotten })).toThrowError(/forgotten/);
  }
});

test("stored memories preserve valid live and tombstone variants with extra metadata", () => {
  for (const forgotten of [undefined, false]) {
    const input = { ...storedMemory, forgotten, metadata: { caller: "retained" } };
    expect(parseMemoryRecord(input)).toStrictEqual(input);
  }
  const tombstone = {
    version: 1,
    id: "agreement",
    forgotten: true,
    revision: 2,
    recordedAt,
    metadata: "retained",
  };
  expect(parseMemoryRecord(tombstone)).toStrictEqual(tombstone);
  expect(() => parseMemoryRecord({ ...tombstone, recordedAt: 0 })).toThrowError(/recordedAt/);
  expect(() => parseMemoryRecord({ ...tombstone, revision: undefined })).toThrowError(/revision/);
  expect(() =>
    parseMemoryRecord({
      ...storedMemory,
      revisions: [{ ...storedMemory.revisions[0], text: null }],
    }),
  ).toThrowError(/text/);
});

test("stored histories retain previously supported timestamp strings and checkpoint metadata", () => {
  const input = {
    ...storedCheckpoint,
    metadata: "retained",
    revisions: [{ ...storedCheckpoint.revisions[0], recordedAt: "October 15, 2026" }],
  };
  expect(parseCheckpointRecord(input)).toStrictEqual(input);
});
