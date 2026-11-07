import type { Scope, Revision } from "../model.ts";
import type {
  MemoryContent,
  StoredMemory,
  CheckpointContent,
  CheckpointRecord,
  Note,
  WorkJournal,
} from "../records/model.ts";
import type { WorkRevision, WorkLedger } from "../work/model.ts";
import type { Original } from "../evidence/model.ts";

export type SourceKind = "memory" | "checkpoint" | "note" | "work" | "evidence";

export type Cursor = Record<Exclude<SourceKind, "work" | "evidence">, Record<string, number>> & {
  work?: Record<string, number>;
  evidence?: Record<string, number>;
  reviewed?: string[];
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
    | (Original & { forgotten?: false })
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

export type SourceReference = { kind: SourceKind; id: string; revision: number };
