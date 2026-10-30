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

export type SourceReference = { kind: SourceKind; id: string; revision: number };
