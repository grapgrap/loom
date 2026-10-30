import type { ProjectLocation } from "./store.ts";
import type { ErasureRequest, ConsolidationHistory, StoredMemory } from "./model.ts";
import { eraseWorkNote } from "./journal.ts";
import {
  forgetMemoryRecord,
  parseMemoryRecord,
  presentLatestRevision,
  createRecordParser,
} from "./records.ts";
import { memoryRecordPath } from "./sources.ts";
import { updateStoredRecord } from "./store.ts";
import { consolidationHistoryPath } from "./tidy.ts";
import {
  getLatestConsolidation,
  eraseFromConsolidationHistory,
  parseConsolidationHistory,
} from "./consolidation.ts";

export async function eraseContext(location: ProjectLocation, request: ErasureRequest) {
  let erased;
  const updatedHistory = await updateStoredRecord<ConsolidationHistory>({
    path: consolidationHistoryPath(location),
    parse: parseConsolidationHistory,
    async update(history) {
      if (request.note) {
        const { id: workId, revision: noteNumber } = request.note;
        erased = await eraseWorkNote(location, { work: workId, revision: noteNumber });
        return eraseFromConsolidationHistory(history, {
          sourceRef: `note:${workId}@${noteNumber}`,
        });
      }
      const { memoryId, expectedRevision } = request;
      const memory = await updateStoredRecord<StoredMemory>({
        path: memoryRecordPath(location, memoryId),
        parse: createRecordParser(memoryId, parseMemoryRecord),
        update: (memory) => (memory === null ? null : forgetMemoryRecord(memory, expectedRevision)),
      });
      if (memory) {
        erased = presentLatestRevision(memory);
        return eraseFromConsolidationHistory(history, { memoryId });
      }
      return eraseFromConsolidationHistory(history, request);
    },
  });
  if (erased) return erased;
  const consolidation = getLatestConsolidation(updatedHistory);
  return {
    id: request.memoryId,
    forgotten: true,
    revision: consolidation.revision,
    recordedAt: consolidation.recordedAt,
  };
}
