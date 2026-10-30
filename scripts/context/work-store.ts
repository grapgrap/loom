import type { ProjectLocation } from "./store.ts";
import type { QueryOptions } from "./model.ts";
import { join } from "node:path";
import { readStoredRecord, updateStoredRecord } from "./store.ts";
import { createRecordParser, parseCheckpointRecord } from "./records.ts";
import { changeWork, currentWorks, parseWorkLedger, presentWork, showWork } from "./work.ts";
import { parseWorkJournal, workJournalPath } from "./journal.ts";

export function workLedgerPath(location: ProjectLocation) {
  return join(location.projectDirectory, "work-state.json");
}

export async function readWorkLedger(location: ProjectLocation) {
  return readStoredRecord(workLedgerPath(location), parseWorkLedger);
}

export async function runWorkCommand(
  location: ProjectLocation,
  action: string,
  id: string,
  input: unknown,
  options: QueryOptions = {},
) {
  if (action === "show") return showWork(await readWorkLedger(location), id, options);
  const legacy =
    action === "create"
      ? await readStoredRecord(
          join(location.projectDirectory, "works", id, "checkpoint.json"),
          createRecordParser(id, parseCheckpointRecord),
        )
      : null;
  const journal =
    action === "create" && !legacy
      ? await readStoredRecord(
          workJournalPath(location, id),
          createRecordParser(id, parseWorkJournal),
        )
      : null;
  const note = journal?.revisions.findLast((entry) => !entry.forgotten);
  const legacyRef = legacy
    ? `checkpoint:${id}@${legacy.revisions.at(-1)!.revision}`
    : note
      ? `note:${id}@${note.revision}`
      : null;
  const ledger = await updateStoredRecord({
    path: workLedgerPath(location),
    parse: parseWorkLedger,
    update: (previous) => changeWork(previous, id, action, input, { legacyRef }),
  });
  return presentWork(currentWorks(ledger).get(id)!);
}

export async function assertLegacyWorkWritable(location: ProjectLocation, id: string) {
  if (currentWorks(await readWorkLedger(location)).has(id))
    throw new Error(
      `Managed work ${id} must use work report/revise/submit/accept/complete; checkpoint cannot overwrite it`,
    );
}
