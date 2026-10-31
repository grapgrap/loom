import { expect, test } from "vitest";
import { parseWorkJournal } from "./journal.ts";

const note = {
  revision: 1,
  recordedAt: "2026-10-15T12:00:00.000Z",
  requestKey: "observation",
  text: "Keep the original observation.",
  source: { type: "agent", reference: "Observed check result" },
};
const journal = { version: 1, id: "storage", revisions: [note] };

test("stored journals reject non-string timestamps at the record boundary", () => {
  for (const recordedAt of [0, [0], null, {}]) {
    expect(() =>
      parseWorkJournal({ ...journal, revisions: [{ ...note, recordedAt }] }),
    ).toThrowError(/recordedAt/);
  }
});

test("stored journals reject non-Boolean forgotten values before treating notes as erased", () => {
  for (const forgotten of ["false", 0, 1, null, [], {}]) {
    expect(() =>
      parseWorkJournal({ ...journal, revisions: [{ ...note, forgotten }] }),
    ).toThrowError(/forgotten/);
  }
});

test("stored journals preserve valid live and erased notes and their metadata", () => {
  for (const forgotten of [undefined, false]) {
    const input = {
      ...journal,
      metadata: "retained",
      revisions: [{ ...note, forgotten, metadata: "retained" }],
    };
    expect(parseWorkJournal(input)).toStrictEqual(input);
  }
  const erased = {
    revision: 1,
    recordedAt: note.recordedAt,
    requestKey: note.requestKey,
    forgotten: true,
  };
  const input = { ...journal, revisions: [erased] };
  expect(parseWorkJournal(input)).toStrictEqual(input);
  expect(() =>
    parseWorkJournal({ ...journal, revisions: [{ ...erased, requestKey: undefined }] }),
  ).toThrowError(/id/);
  expect(() =>
    parseWorkJournal({ ...journal, revisions: [{ ...note, source: undefined }] }),
  ).toThrowError(/source/);
});
