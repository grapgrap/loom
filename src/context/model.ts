export type Scope = { type: "project" } | { type: "work"; id: string };

export type RecordSource = { type: "user" | "agent"; reference: string };

export type Revision = { revision: number; recordedAt: string };

export type RecordHistory<T> = { version: number; id: string; revisions: (T & Revision)[] };

export type Retirement = { reason: string; sources: string[] };

export type QueryOptions = {
  work?: string;
  query?: string;
  entity?: string;
  history?: boolean;
  depth?: number;
  limit?: number;
  offset?: number;
  tree?: boolean;
  full?: boolean;
};
