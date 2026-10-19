import { isDeepStrictEqual } from "node:util";

function collectionChanges(kind, previous, current) {
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
          : newEntry.status !== oldEntry.status &&
              ["retired", "superseded"].includes(newEntry.status)
            ? newEntry.status
            : "updated";
    return [{ kind, id, action, before: oldEntry, after: newEntry }];
  });
}

export function createTidyReport(previous, current, processed, remaining) {
  return {
    processed,
    remaining,
    changes: [
      ...collectionChanges("memory", previous.memories, current.memories),
      ...collectionChanges("work", previous.works, current.works),
      ...collectionChanges("entity", previous.graph.entities, current.graph.entities),
      ...collectionChanges("statement", previous.graph.statements, current.graph.statements),
    ],
  };
}

export function eraseFromTidyReport(report, sanitizedRevision, matchesReference, memoryId) {
  if (!report) return undefined;
  const presentIds = {
    memory: new Set(sanitizedRevision.memories.map(({ id }) => id)),
    work: new Set(sanitizedRevision.works.map(({ id }) => id)),
    entity: new Set((sanitizedRevision.graph?.entities ?? []).map(({ id }) => id)),
    statement: new Set((sanitizedRevision.graph?.statements ?? []).map(({ id }) => id)),
  };
  function sanitizeEntry(kind, entry) {
    if (entry === null) return null;
    if (kind === "memory")
      return { ...entry, supersedes: entry.supersedes.filter((ref) => !matchesReference(ref)) };
    if (kind !== "statement") return entry;
    const supportedIds = presentIds.statement;
    return {
      ...entry,
      supersedes: entry.supersedes.filter((id) => supportedIds.has(id)),
      contradicts: entry.contradicts.filter((id) => supportedIds.has(id)),
      ...(entry.supersededBy
        ? { supersededBy: entry.supersededBy.filter((id) => supportedIds.has(id)) }
        : {}),
      ...(entry.reviewNeeded
        ? { reviewNeeded: entry.reviewNeeded.filter((id) => supportedIds.has(id)) }
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
            .filter(Boolean)
            .every(
              (entry) =>
                ![
                  ...(entry.sources ?? []),
                  ...(entry.retirement?.sources ?? []),
                  ...(entry.evidence ?? []),
                ].some(matchesReference),
            ),
      )
      .map((change) => ({
        ...change,
        before: sanitizeEntry(change.kind, change.before),
        after: sanitizeEntry(change.kind, change.after),
      }))
      .filter(({ before, after }) => !isDeepStrictEqual(before, after)),
  };
}
