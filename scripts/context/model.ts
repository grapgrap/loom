export type Scope = { type: "project" } | { type: "work"; id: string };
export type RecordSource = { type: "user" | "agent"; reference: string };
export type Revision = { revision: number; recordedAt: string };
export type RecordHistory<T> = { version: number; id: string; revisions: (T & Revision)[] };
export type WorkStatus = "active" | "blocked" | "paused" | "submitted" | "complete" | "cancelled";
export type WorkProgress = {
  goal: string;
  status: Exclude<WorkStatus, "submitted">;
  progress: string;
  evidence: string[];
  next: string[];
};
export type MemoryContent = { text: string; reason: string; source: RecordSource };
export type MemoryRecord = RecordHistory<MemoryContent> & { scope: Scope; forgotten?: false };
export type ForgottenMemory = Revision & { version: number; id: string; forgotten: true };
export type StoredMemory = MemoryRecord | ForgottenMemory;
export type CheckpointContent = WorkProgress & { source: RecordSource };
export type CheckpointRecord = RecordHistory<CheckpointContent>;
export type NoteContent = { requestKey: string } & (
  | { text: string; source: RecordSource; forgotten?: false }
  | { forgotten: true }
);
export type Note = Revision & NoteContent;
export type WorkJournal = { version: number; id: string; revisions: Note[] };

export type Criterion = { id: string; description: string; verification: string };
export type Check = {
  criterionId: string;
  verdict: "met" | "unmet" | "unknown";
  observation: string;
  evidence: string[];
};
export type Submission = {
  ref: string;
  definitionRevision: number;
  summary: string;
  artifacts: string[];
  checks: Check[];
  review: null | {
    verdict: "accepted" | "changes-requested";
    actor: string;
    reason: string;
    evidence: string[];
    source: RecordSource;
  };
};
export type Work = {
  id: string;
  definitionRevision: number;
  owner: string;
  goal: string;
  scope: string;
  criteria: Criterion[];
  parent: string | null;
  contributesTo: string[];
  dependsOn: string[];
  required: boolean;
  assignment: { worker: string; reviewer: string; executionId: string | null } | null;
  status: WorkStatus;
  progress: string;
  next: string[];
  checks: Check[];
  submission: Submission | null;
  legacyRef?: string;
  recheckReason?: string;
};
export type WorkRevision = Work &
  Revision & {
    action: string;
    actor: string;
    source: RecordSource;
    requestHash: string | null;
  };
export type WorkLedger = { version: number; works: { id: string; revisions: WorkRevision[] }[] };
export type VisibleWork = Omit<WorkRevision, "requestHash"> & {
  managed: boolean;
  ref: string;
  evidence: string[];
  history?: VisibleWork[];
};

export type Retirement = { reason: string; sources: string[] };
export type Memory = {
  id: string;
  scope: Scope;
  text: string;
  reason: string;
  sources: string[];
  supersedes: string[];
  status: "active" | "unresolved" | "retired";
  retirement?: Retirement;
};
export type ConsolidatedWork = WorkProgress & {
  id: string;
  sources: string[];
  checkpointRevision?: number;
};
export type Entity = {
  id: string;
  kind: string;
  name: string;
  aliases: string[];
  sources: string[];
};
export type Statement = {
  id: string;
  subject: string;
  predicate: string;
  object: { entity: string; value?: never } | { value: unknown; entity?: never };
  text: string;
  scope: Scope;
  sources: string[];
  origin: { kind: "stated" } | { kind: "inferred"; premises: string[] };
  status: "active" | "unresolved" | "retired" | "superseded";
  supersedes: string[];
  contradicts: string[];
  conditions: string[];
  validFrom?: string;
  validUntil?: string;
  retirement?: Retirement;
  supersededBy?: string[];
  reviewNeeded?: string[];
};
export type Graph = { entities: Entity[]; statements: Statement[] };
export type GraphChanges = Graph & { retire: (Retirement & { id: string })[] };
export type SourceKind = "memory" | "checkpoint" | "note" | "work";
export type Cursor = Record<Exclude<SourceKind, "work">, Record<string, number>> & {
  work?: Record<string, number>;
};
type SourceIdentity = Revision & { id: string; ref: string; latest?: boolean };
export type OriginalSource = SourceIdentity &
  (
    | ({ kind: "memory"; scope: Scope; forgotten?: false } & MemoryContent)
    | ({ kind: "checkpoint"; scope: Scope; forgotten?: false } & CheckpointContent)
    | ({ kind: "note"; scope: Scope } & Note)
    | ({ kind: "work"; scope: Scope; workScope: string; forgotten?: false } & Omit<
        WorkRevision,
        "scope"
      >)
    | { kind: SourceKind; forgotten: true; scope?: Scope }
  );
export type SourceArchive = {
  memories: StoredMemory[];
  checkpoints: CheckpointRecord[];
  journals: WorkJournal[];
  works: WorkLedger["works"];
  sources: OriginalSource[];
  bounds: Cursor;
};
export type TidySnapshot = {
  version: number;
  id: string;
  baseRevision: number;
  bounds: Cursor;
  hashes: Record<string, string>;
};
export type TidyChanges = {
  snapshot: string;
  memories: Memory[];
  works: ConsolidatedWork[];
  retire: (Retirement & { id: string })[];
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
export type QueryOptions = {
  work?: string;
  query?: string;
  entity?: string;
  history?: boolean;
  depth?: number;
  limit?: number;
  offset?: number;
  tree?: boolean;
};
export type SourceReference = { kind: SourceKind; id: string; revision: number };
export type ErasureRequest =
  | { note: SourceReference; memoryId?: never; expectedRevision?: never }
  | { note?: never; memoryId: string; expectedRevision: number };
