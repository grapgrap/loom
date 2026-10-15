import { eraseWorkNote } from "./journal.mjs";
import { forgetMemoryRecord, parseMemoryRecord, presentLatestRevision, createRecordParser } from "./records.mjs";
import { memoryRecordPath } from "./sources.mjs";
import { updateStoredRecord } from "./store.mjs";
import { getLatestConsolidation, eraseFromConsolidationHistory, parseConsolidationHistory, consolidationHistoryPath } from "./tidy.mjs";

export async function eraseContext(projectLocation, erasureRequest) {
  let erasedOriginalRecord;
  const updatedHistory = await updateStoredRecord({ path: consolidationHistoryPath(projectLocation), parse: parseConsolidationHistory,
    async update(consolidationHistory) {
      if (erasureRequest.note) {
        const { id: workId, revision: noteNumber } = erasureRequest.note;
        erasedOriginalRecord = await eraseWorkNote(projectLocation, { work: workId, revision: noteNumber });
        return eraseFromConsolidationHistory(consolidationHistory, { sourceRef: `note:${workId}@${noteNumber}` });
      }
      const { memoryId, expectedRevision } = erasureRequest;
      const erasedMemoryRecord = await updateStoredRecord({ path: memoryRecordPath(projectLocation, memoryId),
        parse: createRecordParser(memoryId, parseMemoryRecord),
        update: (storedMemory) => storedMemory === null ? null : forgetMemoryRecord(storedMemory, expectedRevision) });
      if (erasedMemoryRecord) {
        erasedOriginalRecord = presentLatestRevision(erasedMemoryRecord);
        return eraseFromConsolidationHistory(consolidationHistory, { memoryId });
      }
      return eraseFromConsolidationHistory(consolidationHistory, erasureRequest);
    } });
  if (erasedOriginalRecord) return erasedOriginalRecord;
  const consolidation = getLatestConsolidation(updatedHistory);
  return { id: erasureRequest.memoryId, forgotten: true, revision: consolidation.revision, recordedAt: consolidation.recordedAt };
}
