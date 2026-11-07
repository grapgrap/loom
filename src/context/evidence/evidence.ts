import type { ProjectLocation } from "../storage/store.ts";
import type { AppendInput, Applied, CorrectInput, Entry, Ledger } from "./model.ts";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseRecordId } from "../records/records.ts";
import { updateStoredRecord, withProjectLock } from "../storage/store.ts";
import { checkTargetChanges } from "./query.ts";
import {
  bounds,
  ledgerPath,
  originals,
  parseInput,
  parseLedger,
  parseReference,
  readLedger,
  reject,
} from "./store.ts";

export { readLedger } from "./store.ts";

export async function all(location: ProjectLocation) {
  return originals((await readLedger(location)).entries);
}

export async function read(location: ProjectLocation, ref: string) {
  parseReference(ref);
  const record = (await all(location)).find((entry) => entry.ref === ref);
  if (!record) reject(`Evidence reference is missing: ${ref}`);
  return record;
}

export async function readResult(
  location: ProjectLocation,
  requestKey: string,
): Promise<Applied | null> {
  parseRecordId(requestKey, "requestKey");
  const ledger = await readLedger(location);
  const receipt = ledger.requests.find((entry) => entry.requestKey === requestKey);
  return receipt ? applied(ledger, receipt.ref, true) : null;
}

function applied(ledger: Ledger, ref: string, replayed: boolean): Applied {
  const position = ledger.entries.find((entry) => entry.ref === ref)!.position;
  const record = originals(ledger.entries.slice(0, position)).at(-1)!;
  return {
    outcome: "applied",
    status: "applied",
    ref,
    revision: record.revision,
    requestKey: record.requestKey,
    replayed,
    record,
  };
}

async function write(
  location: ProjectLocation,
  operation: "append" | "correct",
  input: AppendInput | CorrectInput,
): Promise<Applied> {
  let ref = "";
  let replayed = false;
  try {
    return await withProjectLock(location, async () => {
      const ledger = await updateStoredRecord<Ledger>({
        path: ledgerPath(location),
        parse: parseLedger,
        update(current) {
          const ledger = current ?? { version: 1 as const, entries: [], requests: [] };
          const receipt = ledger.requests.find(({ requestKey }) => requestKey === input.requestKey);
          if (receipt) {
            if (receipt.operation !== operation || !isDeepStrictEqual(receipt.payload, input))
              reject(
                "The evidence request key was already used with a different operation or payload",
              );
            ref = receipt.ref;
            replayed = true;
            return ledger;
          }
          if (operation === "correct") {
            const correction = input as CorrectInput;
            const target = ledger.entries.find(({ ref }) => ref === correction.relation.target);
            if (!target) reject(`Correction target is missing: ${correction.relation.target}`);
            bounds(target, correction.relation.selector);
            const checked = checkTargetChanges(
              ledger,
              {
                ref: target.ref,
                ...(correction.relation.selector ? { selector: correction.relation.selector } : {}),
              },
              correction.basis,
            );
            if (checked.coverage !== "complete" || checked.change !== "unchanged")
              throw Object.assign(
                new Error("The correction target changed; read and reconcile before retrying"),
                {
                  code: "LOOM_EVIDENCE_CONFLICT",
                  outcome: "conflict",
                  expected: correction.basis,
                  current: checked.basis,
                },
              );
          }
          const id = input.id ?? randomUUID();
          const revision = ledger.entries.filter((entry) => entry.id === id).length + 1;
          ref = `evidence:${id}@${revision}`;
          const { requestKey, id: _id, ...payload } = input;
          const content = { ...payload } as Partial<CorrectInput>;
          delete content.basis;
          const entry: Entry = {
            ...(content as Omit<
              Entry,
              "id" | "ref" | "revision" | "position" | "recordedAt" | "requestKey"
            >),
            access: input.access ?? { status: "not-attempted" },
            id,
            ref,
            revision,
            position: ledger.entries.length + 1,
            recordedAt: new Date().toISOString(),
            requestKey,
          };
          return {
            version: 1,
            entries: [...ledger.entries, entry],
            requests: [...ledger.requests, { requestKey, operation, payload: input, ref }],
          };
        },
      });
      return applied(ledger, ref, replayed);
    });
  } catch (caught) {
    const error = caught as Error & { requestKey?: string };
    error.requestKey = input.requestKey;
    throw error;
  }
}

export async function append(location: ProjectLocation, input: AppendInput) {
  return write(location, "append", parseInput(input, "append"));
}

export async function correct(location: ProjectLocation, input: CorrectInput) {
  return write(location, "correct", parseInput(input, "correct"));
}
