import {
  parseMemoryInput,
  parseCheckpointInput,
  parseMemoryRecord,
  parseCheckpointRecord,
  reviseMemoryRecord,
  reviseCheckpointRecord,
  createRecordParser,
  presentLatestRevision,
} from "./records.mjs";
import { memoryRecordPath, checkpointRecordPath } from "./sources.mjs";
import { updateStoredRecord } from "./store.mjs";

export async function remember(location, id, input) {
  const memory = parseMemoryInput(input);
  const record = await updateStoredRecord({
    path: memoryRecordPath(location, id),
    parse: createRecordParser(id, parseMemoryRecord),
    update: (previous) => reviseMemoryRecord(previous, id, memory),
  });
  return presentLatestRevision(record);
}

export async function checkpoint(location, work, input) {
  const progress = parseCheckpointInput(input);
  const record = await updateStoredRecord({
    path: checkpointRecordPath(location, work),
    parse: createRecordParser(work, parseCheckpointRecord),
    update: (previous) => reviseCheckpointRecord(previous, work, progress),
  });
  return presentLatestRevision(record);
}
