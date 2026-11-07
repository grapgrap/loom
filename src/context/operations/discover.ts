import { createHash } from "node:crypto";
import type { ProjectLocation } from "../storage/store.ts";
import type { Scope } from "../model.ts";
import type { ContentMemory } from "../tidy/model.ts";
import { validateObject, validateText, parseRecordId } from "../records/records.ts";
import { readSourceArchive, matchesContextScope } from "../sources/sources.ts";
import { rankSourcesByQuery, extractSearchText } from "../sources/search.ts";
import { readConsolidationHistory } from "../tidy/tidy.ts";
import { getLatestConsolidation } from "../tidy/consolidation.ts";

type Input = { query: string; work?: string; limit?: number; cursor?: string };
type Candidate = {
  ref: string;
  group: string;
  text: string;
  kind: string;
  scope?: Scope;
  role: "original" | "historical" | "derived";
  sources: string[];
  latest?: boolean;
  representation?: { id: string; revision: number; text: string };
};

export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function discover(location: ProjectLocation, input: Input) {
  validateObject(input, "discovery");
  validateText(input.query, "query");
  if (input.work !== undefined) parseRecordId(input.work);
  const limit = input.limit ?? 10;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
    throw new Error("Discovery limit must be between 1 and 200");
  const [archive, history] = await Promise.all([
    readSourceArchive(location),
    readConsolidationHistory(location),
  ]);
  const current = getLatestConsolidation(history);
  const available = new Set(archive.sources.filter((s) => !s.forgotten).map((s) => s.ref));
  const originals: Candidate[] = archive.sources
    .filter(
      (source) =>
        !source.forgotten && (input.work === undefined || matchesContextScope(source, input.work)),
    )
    .map((source) => ({
      ref: source.ref,
      group: source.kind === "note" ? source.ref : `${source.kind}:${source.id}`,
      text: extractSearchText(source),
      kind: source.kind,
      scope: source.scope,
      role: source.kind === "evidence" ? "original" : "historical",
      sources: [source.ref],
      latest: source.latest,
    }));
  const representations: Candidate[] = current.memories
    .filter(
      (m): m is ContentMemory =>
        m.status !== "retired" &&
        m.status !== "absorbed" &&
        m.sources.every((ref) => available.has(ref)) &&
        (input.work === undefined || matchesContextScope(m, input.work)),
    )
    .map((m) => ({
      ref: m.sources[0],
      group: `derived:${m.id}`,
      text: extractSearchText(m),
      kind: "derived",
      scope: m.scope,
      role: "derived",
      sources: m.sources,
      representation: { id: m.id, revision: current.revision, text: m.text },
    }));
  // This scan is its own index. Its basis includes independent new records as well as corrections.
  const basis = {
    query: input.query,
    work: input.work ?? null,
    fingerprint: fingerprint({ originals, representations }),
    channels: ["originals", "representations"],
  };
  let offset = 0;
  if (input.cursor !== undefined) {
    let cursor;
    try {
      cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
    } catch {
      throw new Error("Invalid discovery cursor");
    }
    if (cursor.basis !== fingerprint(basis))
      throw Object.assign(new Error("Discovery cursor conflict; restart against current sources"), {
        outcome: "conflict",
      });
    if (!Number.isSafeInteger(cursor.offset) || cursor.offset < 0)
      throw new Error("Invalid discovery cursor offset");
    offset = cursor.offset;
  }
  const candidates = [...originals, ...representations];
  // Representation matches have their own identity but point to exact original sources.
  const indexed = candidates.map((entry, index) => ({ ...entry, ref: String(index) }));
  const ranked = rankSourcesByQuery(indexed, input.query, indexed.length);
  const groups = new Map<
    string,
    Candidate & { score: number; excerpt: string; matches: string[] }
  >();
  for (const match of ranked) {
    const entry = candidates[Number(match.ref)];
    const group = groups.get(entry.group);
    if (group) {
      group.matches.push(entry.ref);
      continue;
    }
    groups.set(entry.group, {
      ...entry,
      score: match.score,
      excerpt: match.excerpt,
      matches: [entry.ref],
    });
  }
  const results = [...groups.values()];
  const end = offset + limit;
  return {
    results: results.slice(offset, end),
    basis,
    coverage: { mode: "scan", channels: basis.channels, groups: results.length },
    remaining: Math.max(0, results.length - end),
    next:
      end < results.length
        ? Buffer.from(JSON.stringify({ basis: fingerprint(basis), offset: end })).toString(
            "base64url",
          )
        : null,
  };
}
