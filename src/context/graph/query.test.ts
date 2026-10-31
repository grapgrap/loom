import type { Graph } from "./model.ts";
import type { SourceArchive } from "../sources/model.ts";
import { readFileSync } from "node:fs";
import { expect, expectTypeOf, test } from "vitest";
import { queryGraph } from "./query.ts";

const archive: SourceArchive = {
  sources: [],
  memories: [],
  checkpoints: [],
  journals: [],
  works: [],
  bounds: { memory: {}, checkpoint: {}, note: {} },
};

test("graph query accepts only its published revision and optional graph", () => {
  expectTypeOf<{ revision: number; graph?: Graph }>().toExtend<Parameters<typeof queryGraph>[0]>();
  expect(queryGraph({ revision: 7 }, archive)).toStrictEqual({
    revision: 7,
    entities: [],
    statements: [],
    premises: [],
    paths: [],
    remaining: 0,
    sources: [],
  });
});

test("graph query does not import the parent tidy domain", () => {
  const source = readFileSync(new URL("./query.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/from\s+["']\.\.\/tidy\//);
});
