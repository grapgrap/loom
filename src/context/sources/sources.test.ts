import { expect, test } from "vitest";
import {
  parseSourceReference,
  validateSourceReferences,
  validateRequiredSourceReferences,
} from "./sources.ts";

test("source reference parsing rejects non-string values before regular expression coercion", () => {
  for (const reference of [["note:example@1"], null, 0, {}, true]) {
    expect(() => parseSourceReference(reference as string)).toThrowError(/reference.*string/);
  }
});

test("source reference lists reject nested arrays rather than exposing them as strings", () => {
  expect(() => validateSourceReferences([["note:example@1"]], "sources")).toThrowError(
    /reference.*string/,
  );
  expect(() => validateRequiredSourceReferences([["memory:policy@2"]], "evidence")).toThrowError(
    /reference.*string/,
  );
});

test("source reference contracts preserve all supported kinds, uniqueness and required lists", () => {
  const refs = ["memory:policy@2", "checkpoint:storage@1", "note:example@1", "work:review@3"];
  expect(refs.map((reference) => parseSourceReference(reference))).toStrictEqual([
    { kind: "memory", id: "policy", revision: 2 },
    { kind: "checkpoint", id: "storage", revision: 1 },
    { kind: "note", id: "example", revision: 1 },
    { kind: "work", id: "review", revision: 3 },
  ]);
  expect(() => validateRequiredSourceReferences(refs, "sources")).not.toThrow();
  expect(() => validateSourceReferences([], "supersedes")).not.toThrow();
  expect(() => validateRequiredSourceReferences([], "sources")).toThrowError(/at least one/);
  expect(() => validateSourceReferences([refs[0], refs[0]], "sources")).toThrowError(/duplicate/);
  expect(() => parseSourceReference("note:example@0")).toThrowError(/Invalid source reference/);
});
