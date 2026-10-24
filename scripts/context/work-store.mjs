import { join } from "node:path";
import { readStoredRecord, updateStoredRecord } from "./store.mjs";
import { createRecordParser, parseCheckpointRecord } from "./records.mjs";
import { changeWork, currentWorks, parseWorkLedger, presentWork, showWork } from "./work.mjs";
import { parseWorkJournal, workJournalPath } from "./journal.mjs";

export function workLedgerPath(location) {
  return join(location.projectDirectory, "work-state.json");
}

export async function readWorkLedger(location) {
  return readStoredRecord(workLedgerPath(location), parseWorkLedger);
}

export async function runWorkCommand(location, action, id, input, options = {}) {
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
    ? `checkpoint:${id}@${legacy.revisions.at(-1).revision}`
    : note
      ? `note:${id}@${note.revision}`
      : null;
  const ledger = await updateStoredRecord({
    path: workLedgerPath(location),
    parse: parseWorkLedger,
    update: (previous) => changeWork(previous, id, action, input, { legacyRef }),
  });
  return presentWork(currentWorks(ledger).get(id));
}

export async function assertLegacyWorkWritable(location, id) {
  if (currentWorks(await readWorkLedger(location)).has(id))
    throw new Error(
      `Managed work ${id} must use work report/revise/submit/accept/complete; checkpoint cannot overwrite it`,
    );
}
