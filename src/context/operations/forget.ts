import type { SourceReference } from "../sources/model.ts";

import type { ProjectLocation } from "../storage/store.ts";
import type { ConsolidationHistory } from "../tidy/model.ts";
import type { StoredMemory } from "../records/model.ts";
import { eraseWorkNote } from "../records/journal.ts";
import {
  forgetMemoryRecord,
  parseMemoryRecord,
  presentLatestRevision,
  createRecordParser,
} from "../records/records.ts";
import { memoryRecordPath } from "../sources/sources.ts";
import { updateStoredRecord } from "../storage/store.ts";
import { consolidationHistoryPath } from "../tidy/tidy.ts";
import {
  getLatestConsolidation,
  eraseFromConsolidationHistory,
  parseConsolidationHistory,
} from "../tidy/consolidation.ts";

export type ErasureRequest =
  | { note: SourceReference; memoryId?: never; expectedRevision?: never }
  | { note?: never; memoryId: string; expectedRevision: number };

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
