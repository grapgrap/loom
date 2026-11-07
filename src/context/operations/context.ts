import type { ProjectLocation } from "../storage/store.ts";
import { validateObject, validateText, parseRecordId } from "../records/records.ts";
import { readSource } from "../sources/sources.ts";
import { readWorkLedger } from "../work/store.ts";
import { currentWorks, presentWork } from "../work/work.ts";
import { checkChanges } from "../evidence/query.ts";
import { discover, fingerprint } from "./discover.ts";

// The result supplies evidence to the agent; it never decides applicability or task completion.
export async function prepare(location: ProjectLocation, value: unknown) {
  validateObject(value, "context input");
  const input = value as {
    query: string;
    work?: string;
    refs?: string[];
    limit?: number;
    prior?: { discovery: unknown; corrections: string; work: string | null };
  };
  validateText(input.query, "query");
  if (input.work !== undefined) parseRecordId(input.work);
  if (
    input.refs !== undefined &&
    (!Array.isArray(input.refs) || input.refs.some((x) => typeof x !== "string"))
  )
    throw new Error("refs must be an array of exact references");
  if (input.prior !== undefined) {
    validateObject(input.prior, "prior");
    validateText(input.prior.corrections, "prior.corrections");
  }
  const found = await discover(location, input);
  const refs = [...new Set([...(input.refs ?? []), ...found.results.flatMap((r) => r.sources)])];
  const originals = [];
  const gaps: { ref?: string; reason: string }[] = [];
  for (const ref of refs) {
    try {
      originals.push(await readSource(location, ref));
    } catch (error) {
      gaps.push({ ref, reason: (error as Error).message });
    }
  }
  const changes = await checkChanges(location, {
    seeds: refs.filter((ref) => ref.startsWith("evidence:")),
    ...(input.prior ? { basis: input.prior.corrections } : {}),
  });
  const work = input.work
    ? currentWorks(await readWorkLedger(location)).get(input.work)
    : undefined;
  if (input.work && !work)
    gaps.push({ reason: `No managed work for ${input.work}; historical records may still exist` });
  if (found.remaining)
    gaps.push({
      reason: `${found.remaining} candidate groups remain; continue discovery before claiming full coverage`,
    });
  const snapshot = work ? presentWork(work) : null;
  const basis = { discovery: found.basis, corrections: changes.basis, work: snapshot?.ref ?? null };
  return {
    work: snapshot,
    candidates: found.results,
    originals,
    changes,
    basis,
    coverage: found.coverage,
    next: found.next,
    gaps: [...gaps, ...changes.gaps],
    refresh: {
      discovery: !input.prior
        ? "unknown"
        : fingerprint(input.prior.discovery) === fingerprint(found.basis)
          ? "unchanged"
          : "changed",
      corrections: changes.change,
      work: !input.prior ? "unknown" : input.prior.work === basis.work ? "unchanged" : "changed",
    },
  };
}
