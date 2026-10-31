import type {
  TidyEntries,
  TidyChange,
  TidyReport,
  Memory,
  ConsolidatedWork,
  Consolidation,
} from "./model.ts";
import type { Statement, Graph } from "../graph/model.ts";
import { isDeepStrictEqual } from "node:util";

function collectionChanges<K extends keyof TidyEntries>(
  kind: K,
  previous: TidyEntries[K][],
  current: TidyEntries[K][],
): TidyChange[] {
  const before = new Map(previous.map((entry) => [entry.id, entry]));
  const after = new Map(current.map((entry) => [entry.id, entry]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((id) => {
    const oldEntry = before.get(id) ?? null;
    const newEntry = after.get(id) ?? null;
    if (isDeepStrictEqual(oldEntry, newEntry)) return [];
    const action =
      oldEntry === null
        ? "added"
        : newEntry === null
          ? "removed"
          : "status" in newEntry &&
              "status" in oldEntry &&
              newEntry.status !== oldEntry.status &&
              ["retired", "superseded", "absorbed"].includes(newEntry.status)
            ? newEntry.status
            : "updated";
    return [{ kind, id, action, before: oldEntry, after: newEntry } as TidyChange];
  });
}

export function createTidyReport(
  previous: { memories: Memory[]; works: ConsolidatedWork[]; graph: Graph },
  current: { memories: Memory[]; works: ConsolidatedWork[]; graph?: Graph },
  processed: string[],
  remaining: number,
): TidyReport {
  return {
    processed,
    remaining,
    changes: [
      ...collectionChanges("memory", previous.memories, current.memories),
      ...collectionChanges("work", previous.works, current.works),
      ...collectionChanges("entity", previous.graph.entities, current.graph!.entities),
      ...collectionChanges("statement", previous.graph.statements, current.graph!.statements),
    ],
  };
}

export function eraseFromTidyReport(
  report: TidyReport | undefined,
  sanitizedRevision: Consolidation,
  matchesReference: (ref: string) => boolean,
  memoryId?: string,
): TidyReport | undefined {
  if (!report) return undefined;
  const presentIds = {
    memory: new Set(sanitizedRevision.memories.map(({ id }) => id)),
    work: new Set(sanitizedRevision.works.map(({ id }) => id)),
    entity: new Set((sanitizedRevision.graph?.entities ?? []).map(({ id }) => id)),
    statement: new Set((sanitizedRevision.graph?.statements ?? []).map(({ id }) => id)),
  };
  function sanitizeEntry(
    kind: keyof TidyEntries,
    entry: TidyEntries[keyof TidyEntries] | null,
  ): TidyEntries[keyof TidyEntries] | null {
    if (entry === null) return null;
    if (kind === "memory")
      return {
        ...entry,
        supersedes: (entry as Memory).supersedes.filter((ref) => !matchesReference(ref)),
      };
    if (kind !== "statement") return entry;
    const statement = entry as Statement;
    const supportedIds = presentIds.statement;
    return {
      ...statement,
      supersedes: statement.supersedes.filter((id) => supportedIds.has(id)),
      contradicts: statement.contradicts.filter((id) => supportedIds.has(id)),
      ...(statement.supersededBy
        ? { supersededBy: statement.supersededBy.filter((id) => supportedIds.has(id)) }
        : {}),
      ...(statement.reviewNeeded
        ? { reviewNeeded: statement.reviewNeeded.filter((id) => supportedIds.has(id)) }
        : {}),
    };
  }
  return {
    ...report,
    processed: report.processed.filter((ref) => !matchesReference(ref)),
    changes: report.changes
      .filter(
        ({ kind, id, before, after }) =>
          !(kind === "memory" && id === memoryId) &&
          presentIds[kind].has(id) &&
          [before, after]
            .filter((entry) => entry !== null)
            .every(
              (entry) =>
                ![
                  ...(entry.sources ?? []),
                  ...("retirement" in entry ? (entry.retirement?.sources ?? []) : []),
                  ...("evidence" in entry ? entry.evidence : []),
                ].some(matchesReference),
            ),
      )
      .map(
        (change) =>
          ({
            ...change,
            before: sanitizeEntry(change.kind, change.before),
            after: sanitizeEntry(change.kind, change.after),
          }) as TidyChange,
      )
      .filter(({ before, after }) => !isDeepStrictEqual(before, after)),
  };
}
