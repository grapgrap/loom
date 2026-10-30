import type { RecordSource, Revision } from "../model.ts";

export type WorkStatus = "active" | "blocked" | "paused" | "submitted" | "complete" | "cancelled";

export type WorkProgress = {
  goal: string;
  status: Exclude<WorkStatus, "submitted">;
  progress: string;
  evidence: string[];
  next: string[];
};

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
