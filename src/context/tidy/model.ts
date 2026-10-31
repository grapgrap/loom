import type { Scope, Retirement } from "../model.ts";
import type { WorkProgress } from "../work/model.ts";
import type { Entity, Statement, Graph, GraphChanges } from "../graph/model.ts";
import type { Cursor } from "../sources/model.ts";

type MemoryIdentity = {
  id: string;
  scope: Scope;
  sources: string[];
  supersedes: string[];
  retirement?: Retirement;
};

export type ContentMemory = MemoryIdentity & {
  text: string;
  reason: string;
  status: "active" | "unresolved" | "retired";
};

export type Memory =
  | ContentMemory
  | (MemoryIdentity & {
      status: "absorbed";
      absorption: { into: string[]; reason: string };
    });

type NewMemory = Omit<ContentMemory, "status" | "retirement"> & {
  status: "active" | "unresolved";
};

export type ConsolidatedWork = WorkProgress & {
  id: string;
  sources: string[];
  checkpointRevision?: number;
};

export type TidySnapshot = {
  version: number;
  id: string;
  baseRevision: number;
  bounds: Cursor;
  hashes: Record<string, string>;
  memoryIds?: string[];
};

export type TidyPreparationOptions = {
  limit: number;
  offset?: number;
  revisit?: boolean;
  work?: string;
  query?: string;
};

export type TidyChanges = {
  snapshot: string;
  memories: NewMemory[];
  works: ConsolidatedWork[];
  retire: (Retirement & { id: string })[];
  absorb?: { from: string[]; into: string[]; reason: string }[];
  graph?: GraphChanges;
};

export type TidyEntries = {
  memory: Memory;
  work: ConsolidatedWork;
  entity: Entity;
  statement: Statement;
};

export type TidyChange = {
  [K in keyof TidyEntries]: {
    kind: K;
    id: string;
    action: string;
    before: TidyEntries[K] | null;
    after: TidyEntries[K] | null;
  };
}[keyof TidyEntries];

export type TidyReport = { processed: string[]; remaining: number; changes: TidyChange[] };

export type Consolidation = {
  revision: number;
  recordedAt?: string;
  cursor: Cursor;
  memories: Memory[];
  works: ConsolidatedWork[];
  graph?: Graph;
  snapshot?: string | null;
  requestHash?: string | null;
  report?: TidyReport;
};

export type ConsolidationHistory = {
  version: number;
  forgotten: string[];
  revisions: Consolidation[];
};
