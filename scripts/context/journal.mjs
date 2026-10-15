import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  appendRecordRevision, parseRecordId, createRecordParser, validateRecordVersion, validateRecordRevisions,
  validateRecordSource, validateText,
} from "./records.mjs";
import { updateStoredRecord } from "./store.mjs";

export function parseWorkJournal(workJournal) {
  validateRecordVersion(workJournal);
  validateRecordRevisions(workJournal.revisions, (noteRevision) => {
    parseRecordId(noteRevision.requestKey);
    if (!noteRevision.forgotten) {
      validateText(noteRevision.text, "text");
      validateRecordSource(noteRevision.source);
    }
  });
  if (new Set(workJournal.revisions.map(({ requestKey }) => requestKey)).size !== workJournal.revisions.length) {
    throw new Error("Duplicate record request keys");
  }
  return workJournal;
}

export function workJournalPath(projectLocation, workId) {
  return join(projectLocation.projectDirectory, "works", workId, "notes.json");
}

export async function appendWorkNote(projectLocation, { work: workId, text, source, key: retryKey }) {
  if (retryKey !== undefined) parseRecordId(retryKey);
  validateText(text, "text");
  validateRecordSource(source);
  const requestKey = retryKey ?? randomUUID();
  const noteContent = { text: text.trim(), source, requestKey };
  let updatedJournal;
  try {
    updatedJournal = await updateStoredRecord({
      path: workJournalPath(projectLocation, workId), parse: createRecordParser(workId, parseWorkJournal),
      update(storedJournal) {
        const previousNote = storedJournal?.revisions.find((note) => note.requestKey === requestKey);
        if (previousNote) {
          if (previousNote.forgotten) {
            throw Object.assign(new Error("This record was forgotten; do not retry its old input"), { code: "LOOM_RECORD_FORGOTTEN" });
          }
          if (previousNote.text !== noteContent.text || !isDeepStrictEqual(previousNote.source, source)) {
            throw Object.assign(new Error("The record request key was already used with different content"), { code: "LOOM_RECORD_CONFLICT" });
          }
          return storedJournal;
        }
        return appendRecordRevision(storedJournal, { id: workId }, {
          ...noteContent, expectedRevision: storedJournal?.revisions.length ?? 0,
        });
      },
    });
  } catch (error) {
    if (!["LOOM_RECORD_FORGOTTEN", "LOOM_RECORD_CONFLICT"].includes(error.code)) {
      error.message += `; retry the same record with --key ${requestKey}`;
    }
    throw error;
  }
  const savedNote = updatedJournal.revisions.find((note) => note.requestKey === requestKey);
  return { ref: `note:${workId}@${savedNote.revision}`, work: workId, ...savedNote };
}

export async function eraseWorkNote(projectLocation, { work: workId, revision: noteNumber }) {
  const updatedJournal = await updateStoredRecord({ path: workJournalPath(projectLocation, workId), parse: createRecordParser(workId, parseWorkJournal),
    update(storedJournal) {
      const erasedNote = storedJournal?.revisions[noteNumber - 1];
      if (!erasedNote) throw new Error("Original note does not exist");
      if (erasedNote.forgotten) return storedJournal;
      return { ...storedJournal, revisions: storedJournal.revisions.map((note) => note.revision === noteNumber
        ? { revision: noteNumber, recordedAt: note.recordedAt, requestKey: note.requestKey, forgotten: true }
        : note) };
    } });
  return { ref: `note:${workId}@${noteNumber}`, ...updatedJournal.revisions[noteNumber - 1] };
}
