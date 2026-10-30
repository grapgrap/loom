import type { StoredMemory, CheckpointRecord } from "./model.ts";
import type { ProjectLocation } from "./store.ts";
import {
  parseMemoryInput,
  parseCheckpointInput,
  parseMemoryRecord,
  parseCheckpointRecord,
  reviseMemoryRecord,
  reviseCheckpointRecord,
  createRecordParser,
  presentLatestRevision,
} from "./records.ts";
import { memoryRecordPath, checkpointRecordPath } from "./sources.ts";
import { updateStoredRecord } from "./store.ts";
import { assertLegacyWorkWritable } from "./work-store.ts";

export async function remember(location: ProjectLocation, id: string, input: unknown) {
  const memory = parseMemoryInput(input);
  const record = await updateStoredRecord<StoredMemory>({
    path: memoryRecordPath(location, id),
    parse: createRecordParser(id, parseMemoryRecord),
    update: (previous) => reviseMemoryRecord(previous, id, memory),
  });
  return presentLatestRevision(record);
}

export async function checkpoint(location: ProjectLocation, work: string, input: unknown) {
  await assertLegacyWorkWritable(location, work);
  const progress = parseCheckpointInput(input);
  const record = await updateStoredRecord<CheckpointRecord>({
    path: checkpointRecordPath(location, work),
    parse: createRecordParser(work, parseCheckpointRecord),
    update: (previous) => reviseCheckpointRecord(previous, work, progress),
  });
  return presentLatestRevision(record);
}
