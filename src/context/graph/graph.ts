import type { Entity, Statement, Graph, GraphChanges } from "./model.ts";
import { isDeepStrictEqual } from "node:util";
import { parseRecordId, validateMemoryScope, validateText } from "../records/records.ts";
import { validateRequiredSourceReferences } from "../sources/sources.ts";

export function emptyGraph(): Graph {
  return { entities: [], statements: [] };
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateIds(ids: string[], label: string) {
  ids.forEach((id) => parseRecordId(id));
  assertCondition(new Set(ids).size === ids.length, `Duplicate ${label}`);
}

function parseEntity(input: unknown): Entity {
  const { id, kind, name, aliases = [], sources } = input as Entity;
  parseRecordId(id);
  parseRecordId(kind);
  validateText(name, "entity.name");
  aliases.forEach((alias) => validateText(alias, "entity.alias"));
  validateRequiredSourceReferences(sources, "entity.sources");
  return { id, kind, name, aliases, sources };
}

function parseStatement(input: unknown): Statement {
  const {
    id,
    subject,
    predicate,
    object,
    text,
    scope,
    sources,
    origin,
    status = "active",
    supersedes = [],
    contradicts = [],
    conditions = [],
    validFrom,
    validUntil,
  } = input as Statement;
  [id, subject, predicate].forEach((id) => parseRecordId(id));
  if (object.entity !== undefined) parseRecordId(object.entity);
  validateText(text, "statement.text");
  validateMemoryScope(scope);
  validateRequiredSourceReferences(sources, "statement.sources");
  validateIds(supersedes, "superseded statement IDs");
  validateIds(contradicts, "contradicted statement IDs");
  conditions.forEach((condition) => validateText(condition, "statement.condition"));
  if (origin.kind === "inferred") {
    validateIds(origin.premises, "premise IDs");
    assertCondition(origin.premises.length > 0, "An inferred statement needs premises");
  }
  for (const timestamp of [validFrom, validUntil]) {
    if (timestamp !== undefined)
      assertCondition(
        Number.isFinite(Date.parse(timestamp)),
        "Invalid statement validity timestamp",
      );
  }
  if (validFrom !== undefined && validUntil !== undefined) {
    assertCondition(
      Date.parse(validFrom) < Date.parse(validUntil),
      "Statement validity must end after it starts",
    );
  }
  return {
    id,
    subject,
    predicate,
    object: object.entity !== undefined ? { entity: object.entity } : { value: object.value },
    text,
    scope,
    sources,
    origin:
      origin.kind === "inferred"
        ? { kind: origin.kind, premises: origin.premises }
        : { kind: origin.kind },
    status,
    supersedes,
    contradicts,
    conditions,
    ...(validFrom === undefined ? {} : { validFrom }),
    ...(validUntil === undefined ? {} : { validUntil }),
  };
}

export function parseGraphChanges(value: unknown = {}): GraphChanges {
  const input = value as Partial<GraphChanges>;
  const changes = {
    entities: (input.entities ?? []).map(parseEntity),
    statements: (input.statements ?? []).map(parseStatement),
    retire: (input.retire ?? []).map(({ id, reason, sources }) => {
      parseRecordId(id);
      validateText(reason, "statement retirement reason");
      validateRequiredSourceReferences(sources, "statement retirement sources");
      return { id, reason, sources };
    }),
  };
  validateIds(
    changes.entities.map(({ id }) => id),
    "entity IDs",
  );
  validateIds(
    [...changes.statements, ...changes.retire].map(({ id }) => id),
    "statement changes",
  );
  return changes;
}

function assertNoCycles(
  statements: Map<string, Statement>,
  references: (statement: Statement) => string[],
  label: string,
) {
  const visited = new Set();
  const visiting = new Set();
  function visit(id: string) {
    if (visited.has(id)) return;
    assertCondition(!visiting.has(id), `${label} cycle at ${id}`);
    visiting.add(id);
    for (const reference of references(statements.get(id)!)) visit(reference);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of statements.keys()) visit(id);
}

function assertGraphReferences(graph: Graph) {
  const entityIds = new Set(graph.entities.map(({ id }) => id));
  const statements = new Map(graph.statements.map((statement) => [statement.id, statement]));
  for (const statement of statements.values()) {
    for (const id of [statement.subject, statement.object.entity].filter(
      (id) => id !== undefined,
    )) {
      assertCondition(entityIds.has(id), `Unknown entity: ${id}`);
    }
    for (const id of [
      ...statement.supersedes,
      ...statement.contradicts,
      ...(statement.origin.kind === "inferred" ? statement.origin.premises : []),
    ]) {
      assertCondition(statements.has(id), `Unknown statement: ${id}`);
    }
  }
  assertNoCycles(
    statements,
    (statement) => (statement.origin.kind === "inferred" ? statement.origin.premises : []),
    "Premise",
  );
  assertNoCycles(statements, (statement) => statement.supersedes, "Replacement");
}

export function validateGraph(graph: Graph) {
  graph.entities.forEach(parseEntity);
  graph.statements.forEach((statement) => {
    parseStatement(statement);
    if (statement.retirement) {
      validateText(statement.retirement.reason, "statement retirement reason");
      validateRequiredSourceReferences(
        statement.retirement.sources,
        "statement retirement sources",
      );
    }
  });
  validateIds(
    graph.entities.map(({ id }) => id),
    "entity IDs",
  );
  validateIds(
    graph.statements.map(({ id }) => id),
    "statement IDs",
  );
  assertGraphReferences(graph);
}

function flagOutdatedInferences(statements: Map<string, Statement>) {
  let hasChanges = true;
  while (hasChanges) {
    hasChanges = false;
    for (const [id, statement] of statements) {
      if (statement.status !== "active" || statement.origin.kind !== "inferred") continue;
      const outdatedPremiseIds = statement.origin.premises.filter(
        (id) => statements.get(id)!.status !== "active",
      );
      if (!outdatedPremiseIds.length) continue;
      statements.set(id, { ...statement, status: "unresolved", reviewNeeded: outdatedPremiseIds });
      hasChanges = true;
    }
  }
}

function applyStatementTransitions(
  statements: Map<string, Statement>,
  addedStatements: Statement[],
  retirements: GraphChanges["retire"],
) {
  const replacements = addedStatements.filter(({ supersedes }) => supersedes.length > 0);
  const retiringStatementIds = new Set(retirements.map(({ id }) => id));
  for (const replacement of replacements) {
    assertCondition(
      replacement.status === "active",
      "Only an active statement can supersede another statement",
    );
    for (const replacedId of replacement.supersedes) {
      const replaced = statements.get(replacedId)!;
      assertCondition(
        isDeepStrictEqual(replaced.scope, replacement.scope),
        "A replacement must keep the statement's scope",
      );
      assertCondition(
        !retiringStatementIds.has(replacedId),
        "A statement cannot be retired and superseded in one tidy",
      );
      statements.set(replacedId, {
        ...replaced,
        status: "superseded",
        supersededBy: [...new Set([...(replaced.supersededBy ?? []), replacement.id])].sort(),
      });
    }
  }
  for (const { id, reason, sources } of retirements) {
    const statement = statements.get(id)!;
    assertCondition(statement, `Unknown statement: ${id}`);
    statements.set(id, { ...statement, status: "retired", retirement: { reason, sources } });
  }
  flagOutdatedInferences(statements);
  for (const { id } of replacements) {
    assertCondition(
      statements.get(id)!.status !== "unresolved",
      `An unresolved statement cannot supersede another statement: ${id}`,
    );
  }
}

export function applyGraphChanges(
  previous: Graph,
  changes: GraphChanges,
  knownWorkIds: Set<string>,
): Graph {
  const entities = new Map(previous.entities.map((entity) => [entity.id, entity]));
  const statements = new Map(previous.statements.map((statement) => [statement.id, statement]));
  const addedStatements = [];
  for (const entity of changes.entities) {
    const existing = entities.get(entity.id);
    assertCondition(!existing || existing.kind === entity.kind, "An entity's kind cannot change");
    entities.set(entity.id, entity);
  }
  for (const statement of changes.statements) {
    const existing = statements.get(statement.id)!;
    assertCondition(
      !existing || isDeepStrictEqual(existing, statement),
      `Statement ${statement.id} is immutable; create a new statement`,
    );
    if (statement.scope.type === "work")
      assertCondition(knownWorkIds.has(statement.scope.id), `Unknown work: ${statement.scope.id}`);
    statements.set(statement.id, statement);
    if (!existing) addedStatements.push(statement);
  }
  assertGraphReferences({ entities: [...entities.values()], statements: [...statements.values()] });
  applyStatementTransitions(statements, addedStatements, changes.retire);
  return {
    entities: [...entities.values()].sort((a, b) => a.id.localeCompare(b.id)),
    statements: [...statements.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function eraseFromGraph(graph: Graph, matchesReference: (ref: string) => boolean): Graph {
  const entities = graph.entities.filter(({ sources }) => !sources.some(matchesReference));
  const entityIds = new Set(entities.map(({ id }) => id));
  let statements = graph.statements.filter(
    (statement) =>
      ![...statement.sources, ...(statement.retirement?.sources ?? [])].some(matchesReference) &&
      entityIds.has(statement.subject) &&
      (statement.object.entity === undefined || entityIds.has(statement.object.entity)),
  );
  while (true) {
    const ids = new Set(statements.map(({ id }) => id));
    const supported = statements.filter(
      ({ origin }) => origin.kind !== "inferred" || origin.premises.every((id) => ids.has(id)),
    );
    if (supported.length === statements.length) break;
    statements = supported;
  }
  const ids = new Set(statements.map(({ id }) => id));
  return {
    entities,
    statements: statements.map((statement) => ({
      ...statement,
      supersedes: statement.supersedes.filter((id) => ids.has(id)),
      contradicts: statement.contradicts.filter((id) => ids.has(id)),
      ...(statement.supersededBy
        ? { supersededBy: statement.supersededBy.filter((id) => ids.has(id)) }
        : {}),
      ...(statement.reviewNeeded
        ? { reviewNeeded: statement.reviewNeeded.filter((id) => ids.has(id)) }
        : {}),
    })),
  };
}
