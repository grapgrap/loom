import type { ProjectLocation } from "../storage/store.ts";
import type { QueryOptions } from "../model.ts";
import type { AppliedWork } from "./model.ts";
import { join } from "node:path";
import { readStoredRecord, updateStoredRecord } from "../storage/store.ts";
import { createRecordParser, parseCheckpointRecord, parseRecordId } from "../records/records.ts";
import {
  changeWork,
  currentWorks,
  findRequest,
  parseWorkLedger,
  presentWork,
  showWork,
} from "./work.ts";
import { parseWorkJournal, workJournalPath } from "../records/journal.ts";

export function workLedgerPath(location: ProjectLocation) {
  return join(location.projectDirectory, "work-state.json");
}

export async function readWorkLedger(location: ProjectLocation) {
  return readStoredRecord(workLedgerPath(location), parseWorkLedger);
}

export async function readWorkResult(
  location: ProjectLocation,
  key: string,
): Promise<AppliedWork | null> {
  parseRecordId(key, "requestKey");
  const applied = findRequest(await readWorkLedger(location), key);
  return applied ? { ...presentWork(applied), outcome: "applied", replayed: true } : null;
}

export async function runWorkCommand(
  location: ProjectLocation,
  action: string,
  id: string,
  input: unknown,
  options: QueryOptions = {},
) {
  if (action === "show") return showWork(await readWorkLedger(location), id, options);
  const key = (input as { requestKey?: string } | null)?.requestKey;
  let replayed = false;
  const ledger = await updateStoredRecord({
    path: workLedgerPath(location),
    parse: parseWorkLedger,
    async update(previous) {
      let legacyRef: string | null = null;
      if (action === "create" && (key === undefined || !findRequest(previous, key))) {
        const legacy = await readStoredRecord(
          join(location.projectDirectory, "works", id, "checkpoint.json"),
          createRecordParser(id, parseCheckpointRecord),
        );
        const journal = legacy
          ? null
          : await readStoredRecord(
              workJournalPath(location, id),
              createRecordParser(id, parseWorkJournal),
            );
        const note = journal?.revisions.findLast((entry) => !entry.forgotten);
        legacyRef = legacy
          ? `checkpoint:${id}@${legacy.revisions.at(-1)!.revision}`
          : note
            ? `note:${id}@${note.revision}`
            : null;
      }
      let next;
      try {
        next = changeWork(previous, id, action, input, { legacyRef });
      } catch (caught) {
        const error = caught as Error & { outcome?: string };
        error.outcome ??= "rejected";
        throw error;
      }
      replayed = next === previous;
      return next;
    },
  });
  const applied = key === undefined ? currentWorks(ledger).get(id)! : findRequest(ledger, key)!;
  return { ...presentWork(applied), outcome: "applied" as const, replayed };
}

export async function assertLegacyWorkWritable(location: ProjectLocation, id: string) {
  if (currentWorks(await readWorkLedger(location)).has(id))
    throw new Error(
      `Managed work ${id} must use work report/revise/submit/accept/complete; checkpoint cannot overwrite it`,
    );
}
