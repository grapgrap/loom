import type { Scope, RecordSource, Revision, RecordHistory } from "../model.ts";
import type { WorkProgress } from "../work/model.ts";

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
