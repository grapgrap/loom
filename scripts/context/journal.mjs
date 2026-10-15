import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  appendRecordRevision,
  parseRecordId,
  createRecordParser,
  validateRecordVersion,
  validateRecordRevisions,
  validateRecordSource,
  validateText,
} from "./records.mjs";
import { updateStoredRecord } from "./store.mjs";

export function parseWorkJournal(journal) {
  validateRecordVersion(journal);
  validateRecordRevisions(journal.revisions, (note) => {
    parseRecordId(note.requestKey);
    if (!note.forgotten) {
      validateText(note.text, "text");
      validateRecordSource(note.source);
    }
  });
  if (
    new Set(journal.revisions.map(({ requestKey }) => requestKey)).size !== journal.revisions.length
  ) {
    throw new Error("Duplicate record request keys");
  }
  return journal;
}

export function workJournalPath(location, work) {
  return join(location.projectDirectory, "works", work, "notes.json");
}

export async function appendWorkNote(location, { work, text, source, key: retryKey }) {
  if (retryKey !== undefined) parseRecordId(retryKey);
  validateText(text, "text");
  validateRecordSource(source);
  const requestKey = retryKey ?? randomUUID();
  const noteContent = { text: text.trim(), source, requestKey };
  let updated;
  try {
    updated = await updateStoredRecord({
      path: workJournalPath(location, work),
      parse: createRecordParser(work, parseWorkJournal),
      update(journal) {
        const previousNote = journal?.revisions.find((note) => note.requestKey === requestKey);
        if (previousNote) {
          if (previousNote.forgotten) {
            throw Object.assign(
              new Error("This record was forgotten; do not retry its old input"),
              { code: "LOOM_RECORD_FORGOTTEN" },
            );
          }
          if (
            previousNote.text !== noteContent.text ||
            !isDeepStrictEqual(previousNote.source, source)
          ) {
            throw Object.assign(
              new Error("The record request key was already used with different content"),
              { code: "LOOM_RECORD_CONFLICT" },
            );
          }
          return journal;
        }
        return appendRecordRevision(
          journal,
          { id: work },
          {
            ...noteContent,
            expectedRevision: journal?.revisions.length ?? 0,
          },
        );
      },
    });
  } catch (error) {
    if (!["LOOM_RECORD_FORGOTTEN", "LOOM_RECORD_CONFLICT"].includes(error.code)) {
      error.message += `; retry the same record with --key ${requestKey}`;
    }
    throw error;
  }
  const savedNote = updated.revisions.find((note) => note.requestKey === requestKey);
  return { ref: `note:${work}@${savedNote.revision}`, work, ...savedNote };
}

export async function eraseWorkNote(location, { work, revision: noteNumber }) {
  const updated = await updateStoredRecord({
    path: workJournalPath(location, work),
    parse: createRecordParser(work, parseWorkJournal),
    update(journal) {
      const erasedNote = journal?.revisions[noteNumber - 1];
      if (!erasedNote) throw new Error("Original note does not exist");
      if (erasedNote.forgotten) return journal;
      return {
        ...journal,
        revisions: journal.revisions.map((note) =>
          note.revision === noteNumber
            ? {
                revision: noteNumber,
                recordedAt: note.recordedAt,
                requestKey: note.requestKey,
                forgotten: true,
              }
            : note,
        ),
      };
    },
  });
  return { ref: `note:${work}@${noteNumber}`, ...updated.revisions[noteNumber - 1] };
}
