import { expect, test } from "vitest";
import { parseMemoryInput, parseCheckpointInput, validateRecordSource } from "./records.ts";

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
