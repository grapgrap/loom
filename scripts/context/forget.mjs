import { eraseWorkNote } from "./journal.mjs";
import {
  forgetMemoryRecord,
  parseMemoryRecord,
  presentLatestRevision,
  createRecordParser,
} from "./records.mjs";
import { memoryRecordPath } from "./sources.mjs";
import { updateStoredRecord } from "./store.mjs";
import { consolidationHistoryPath } from "./tidy.mjs";
import {
  getLatestConsolidation,
  eraseFromConsolidationHistory,
  parseConsolidationHistory,
} from "./consolidation.mjs";

export async function eraseContext(location, request) {
  let erased;
  const updatedHistory = await updateStoredRecord({
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
      const memory = await updateStoredRecord({
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
