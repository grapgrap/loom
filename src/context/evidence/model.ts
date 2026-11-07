import type { RecordSource, Scope } from "../model.ts";

export type Kind = "decision" | "correction" | "proposal" | "inference" | "observation";
export type Standing = "proposed" | "adopted" | "unresolved" | "observed";
export type Applies = {
  target: string;
  conditions: string[];
  lifetime: string;
  targetVersion?: string;
};
export type Locator = { reference: string; version?: string; extent?: string };
export type Access =
  | {
      status: "read";
      resolvedLocator: string;
      observedVersion?: string;
      capturedExtent: string;
    }
  | { status: "unavailable"; reason: string }
  | { status: "not-attempted" };
export type Selector = { unit: string } | { start: number; end: number };
export type Unit = { id: string; start: number; end: number };
export type Seed = { ref: string; selector?: Selector };
export type Relation = {
  type: "replaces" | "withdraws" | "adopts";
  target: string;
  selector?: Selector;
  applies: Applies;
};
export type Content = {
  scope: Scope;
  text: string;
  kind: Kind;
  standing: Standing;
  applies: Applies;
  source: RecordSource;
  capture: "direct" | "reported" | "inferred";
  locator?: Locator;
  access?: Access;
  reason?: string;
  units?: Unit[];
};
export type AppendInput = Content & { requestKey: string; id?: string };
export type CorrectInput = AppendInput & { relation: Relation; basis: string };
export type Entry = Content & {
  id: string;
  ref: string;
  revision: number;
  position: number;
  recordedAt: string;
  requestKey: string;
  access: Access;
  relation?: Relation;
};
export type Original = Omit<Entry, "kind"> & {
  kind: "evidence";
  recordKind: Kind;
  latest: boolean;
};
export type Receipt = {
  requestKey: string;
  operation: "append" | "correct";
  payload: AppendInput | CorrectInput;
  ref: string;
};
export type Ledger = { version: 1; entries: Entry[]; requests: Receipt[] };
export type Applied = {
  outcome: "applied";
  status: "applied";
  ref: string;
  revision: number;
  requestKey: string;
  replayed: boolean;
  record: Original;
};
export type CheckInput = {
  seeds: (string | Seed)[];
  at?: "current" | number;
  basis?: string;
  budget?: number;
};
export type Gap = { type: string; ref?: string; reason: string };
export type CheckedRelation = Relation & { ref: string; effective: boolean };
export type RecordStanding = {
  ref: string;
  selector?: Selector;
  standing: Standing | "replaced" | "withdrawn" | "partial";
  ranges: {
    selector?: Selector;
    applies: Applies;
    standing: Standing | "replaced" | "withdrawn";
    via: string[];
  }[];
};
export type CheckResult = {
  at: number;
  coverage: "complete" | "partial";
  records: Original[];
  relations: CheckedRelation[];
  standings: RecordStanding[];
  conflicts: { target: string; refs: string[]; reason: string }[];
  gaps: Gap[];
  basis: string;
  change: "changed" | "unchanged" | "unknown";
};
export type DiscoverInput = {
  query: string;
  scope?: Scope;
  work?: string;
  maxGroups?: number;
  cursor?: string;
  at?: "current" | number;
};
export type Match = { ref: string; score: number; excerpt: string; source: "original" };
export type Group = { id: string; latest: string; refs: string[]; matches: Match[] };
export type DiscoveryBasis = {
  query: string;
  scope?: Scope;
  work?: string;
  at: number;
  channels: string[];
  representationRevision: number;
  fingerprint: string;
};
export type DiscoverResult = {
  groups: Group[];
  at: number;
  coverage: { channel: string; through: number; status: "complete" | "partial" }[];
  index: { mode: "ledger-scan"; through: number; representationRevision: number };
  gaps: Gap[];
  discoveryBasis: DiscoveryBasis;
  nextCursor?: string;
};
