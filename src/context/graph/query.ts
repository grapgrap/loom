import type { Statement, Entity, PublishedGraph } from "./model.ts";
import type { SourceArchive } from "../sources/model.ts";
import type { QueryOptions } from "../model.ts";
type GraphPath = { entities: string[]; statements: string[] };
import { emptyGraph, eraseFromGraph } from "./graph.ts";
import { extractSearchText, rankSourcesByQuery } from "../sources/search.ts";
import { matchesContextScope } from "../sources/sources.ts";

function statementEntities(statement: Statement) {
  return [statement.subject, statement.object.entity].filter((id) => id !== undefined);
}

function collectPaths(
  statements: Statement[],
  { entity, query, depth }: { entity?: string; query?: string; depth: number },
  entitiesById: Map<string, Entity>,
) {
  const paths = new Map<string, GraphPath>();
  const queue: GraphPath[] = [];
  const seenEntities = new Set();
  const byEntity = new Map<string, Statement[]>();
  for (const statement of statements) {
    for (const id of statementEntities(statement)) {
      if (!byEntity.has(id)) byEntity.set(id, []);
      byEntity.get(id)!.push(statement);
    }
  }
  function seed(id: string) {
    if (!byEntity.has(id) || seenEntities.has(id)) return;
    seenEntities.add(id);
    queue.push({ entities: [id], statements: [] });
  }
  if (entity !== undefined) seed(entity);
  else if (query?.trim()) {
    const ranked = rankSourcesByQuery(
      statements.map((statement) => ({
        ref: statement.id,
        text: [
          statement.id,
          statement.predicate,
          statement.text,
          ...statementEntities(statement).flatMap((id) => {
            const entity = entitiesById.get(id)!;
            return [entity.id, entity.name, ...entity.aliases];
          }),
        ].join(" "),
      })),
      query,
      statements.length,
    );
    const byId = new Map(statements.map((statement) => [statement.id, statement]));
    for (const { ref } of ranked) {
      const statement = byId.get(ref)!;
      const ids = statementEntities(statement);
      paths.set(ref, { entities: ids, statements: [ref] });
      ids.forEach(seed);
    }
  } else {
    for (const statement of statements)
      paths.set(statement.id, {
        entities: statementEntities(statement),
        statements: [statement.id],
      });
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const path = queue[cursor];
    if (path.statements.length >= depth) continue;
    const from = path.entities.at(-1)!;
    for (const statement of byEntity.get(from)!) {
      if (paths.has(statement.id)) continue;
      const other = statementEntities(statement).find((id) => id !== from);
      const next = {
        entities: other === undefined ? path.entities : [...path.entities, other],
        statements: [...path.statements, statement.id],
      };
      paths.set(statement.id, next);
      if (other !== undefined && !seenEntities.has(other)) {
        seenEntities.add(other);
        queue.push(next);
      }
    }
  }
  return [...paths.entries()];
}

function collectPremises(selected: Statement[], statementsById: Map<string, Statement>) {
  const selectedIds = new Set(selected.map(({ id }) => id));
  const visited = new Set(selectedIds);
  const premises: Statement[] = [];
  function visit(statement: Statement) {
    if (statement.origin.kind !== "inferred") return;
    for (const id of statement.origin.premises) {
      if (visited.has(id)) continue;
      visited.add(id);
      const premise = statementsById.get(id)!;
      premises.push(premise);
      visit(premise);
    }
  }
  selected.forEach(visit);
  return premises;
}

export function queryGraph(
  published: PublishedGraph,
  sourceArchive: SourceArchive,
  { work, query, entity, history, depth = 2, limit = 50 }: QueryOptions = {},
) {
  const availableSources = new Map(
    sourceArchive.sources
      .filter(({ forgotten }) => !forgotten)
      .map((source) => [source.ref, source]),
  );
  const supportedGraph = eraseFromGraph(
    published.graph ?? emptyGraph(),
    (ref) => !availableSources.has(ref),
  );
  const statements = supportedGraph.statements.filter(
    (statement) =>
      matchesContextScope(statement, work) &&
      (history || statement.status === "active" || statement.status === "unresolved"),
  );
  const entitiesById = new Map(supportedGraph.entities.map((entity) => [entity.id, entity]));
  const candidates = collectPaths(statements, { query, entity, depth }, entitiesById);
  const selectedPaths = candidates.slice(0, limit);
  const statementsById = new Map(
    supportedGraph.statements.map((statement) => [statement.id, statement]),
  );
  const selected = selectedPaths.map(([id]) => statementsById.get(id)!);
  const premises = collectPremises(selected, statementsById);
  const entityIds = new Set([...selected, ...premises].flatMap(statementEntities));
  const selectedEntities = [...entityIds].map((id) => entitiesById.get(id)!);
  const sourceRefs = new Set(
    [...selected, ...premises, ...selectedEntities].flatMap(({ sources }) => sources),
  );
  return {
    revision: published.revision,
    entities: selectedEntities,
    statements: selected,
    premises,
    paths: selectedPaths.map(([, path]) => path),
    remaining: candidates.length - selected.length,
    sources: [...sourceRefs].map((ref) => {
      const source = availableSources.get(ref)!;
      return {
        ref,
        scope: source.scope,
        recordedAt: source.recordedAt,
        excerpt: extractSearchText(source).slice(0, 800),
      };
    }),
  };
}
