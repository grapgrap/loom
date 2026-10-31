import type { Entity, Statement, NewStatement, Graph, GraphChanges } from "./model.ts";
import type { Retirement } from "../model.ts";
import { isDeepStrictEqual } from "node:util";
import {
  parseRecordId,
  validateMemoryScope,
  validateText,
  validateObject,
  validateArray,
  validateChoice,
} from "../records/records.ts";
import { validateRequiredSourceReferences } from "../sources/sources.ts";

export function emptyGraph(): Graph {
  return { entities: [], statements: [] };
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateIds(ids: unknown, label: string): asserts ids is string[] {
  validateArray(ids, label);
  ids.forEach((id) => parseRecordId(id));
  assertCondition(new Set(ids).size === ids.length, `Duplicate ${label}`);
}

function validateTexts(values: unknown, label: string): asserts values is string[] {
  validateArray(values, label);
  values.forEach((value) => validateText(value, label));
}

function validateEntity(input: unknown): asserts input is Entity {
  validateObject(input, "entity");
  parseRecordId(input.id);
  parseRecordId(input.kind);
  validateText(input.name, "entity.name");
  validateTexts(input.aliases, "entity.aliases");
  validateRequiredSourceReferences(input.sources, "entity.sources");
}

function parseEntity(input: unknown): Entity {
  validateObject(input, "entity");
  const { id, kind, name, aliases = [], sources } = input;
  const entity = { id, kind, name, aliases, sources };
  validateEntity(entity);
  return entity;
}

function validateRetirement(input: unknown): asserts input is Retirement {
  validateObject(input, "statement retirement");
  validateText(input.reason, "statement retirement reason");
  validateRequiredSourceReferences(input.sources, "statement retirement sources");
}

function validateStatementContent(input: unknown): asserts input is Omit<Statement, "status"> {
  validateObject(input, "statement");
  [input.id, input.subject, input.predicate].forEach((id) => parseRecordId(id));
  validateObject(input.object, "statement.object");
  if (input.object.entity !== undefined) parseRecordId(input.object.entity);
  else
    assertCondition(
      Object.hasOwn(input.object, "value") && input.object.value !== undefined,
      "statement.object must contain an entity or value",
    );
  validateText(input.text, "statement.text");
  validateMemoryScope(input.scope);
  validateRequiredSourceReferences(input.sources, "statement.sources");
  validateIds(input.supersedes, "superseded statement IDs");
  validateIds(input.contradicts, "contradicted statement IDs");
  validateTexts(input.conditions, "statement.conditions");
  validateObject(input.origin, "statement.origin");
  validateChoice(input.origin.kind, ["stated", "inferred"], "statement.origin.kind");
  if (input.origin.kind === "inferred") {
    validateIds(input.origin.premises, "premise IDs");
    assertCondition(input.origin.premises.length > 0, "An inferred statement needs premises");
  }
  const { validFrom, validUntil } = input;
  for (const [field, timestamp] of [
    ["validFrom", validFrom],
    ["validUntil", validUntil],
  ] as const) {
    if (timestamp === undefined) continue;
    validateText(timestamp, `statement.${field}`);
    assertCondition(Number.isFinite(Date.parse(timestamp)), `Invalid statement.${field} timestamp`);
  }
  if (validFrom !== undefined && validUntil !== undefined) {
    assertCondition(
      Date.parse(validFrom as string) < Date.parse(validUntil as string),
      "Statement validity must end after it starts",
    );
  }
  if (input.retirement !== undefined) validateRetirement(input.retirement);
  if (input.supersededBy !== undefined) validateIds(input.supersededBy, "supersededBy IDs");
  if (input.reviewNeeded !== undefined) validateIds(input.reviewNeeded, "reviewNeeded IDs");
}

function parseStatement(input: unknown): NewStatement {
  validateObject(input, "statement");
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
  } = input;
  validateChoice(status, ["active", "unresolved"], "statement.status");
  const statement = {
    id,
    subject,
    predicate,
    object,
    text,
    scope,
    sources,
    origin,
    supersedes,
    contradicts,
    conditions,
    ...(validFrom === undefined ? {} : { validFrom }),
    ...(validUntil === undefined ? {} : { validUntil }),
  };
  validateStatementContent(statement);
  return {
    ...statement,
    status,
    object:
      statement.object.entity !== undefined
        ? { entity: statement.object.entity }
        : { value: statement.object.value },
    origin:
      statement.origin.kind === "inferred"
        ? { kind: statement.origin.kind, premises: statement.origin.premises }
        : { kind: statement.origin.kind },
  };
}

function parseStatementRetirement(input: unknown): Retirement & { id: string } {
  validateObject(input, "statement retirement");
  const { id, reason, sources } = input;
  const retirement = { id: parseRecordId(id), reason, sources };
  validateRetirement(retirement);
  return retirement;
}

export function parseGraphChanges(value: unknown = {}): GraphChanges {
  validateObject(value, "graph");
  const { entities = [], statements = [], retire = [] } = value;
  validateArray(entities, "graph.entities");
  validateArray(statements, "graph.statements");
  validateArray(retire, "graph.retire");
  const changes = {
    entities: entities.map(parseEntity),
    statements: statements.map(parseStatement),
    retire: retire.map(parseStatementRetirement),
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

export function validateGraph(graph: unknown): asserts graph is Graph {
  validateObject(graph, "graph");
  validateArray(graph.entities, "graph.entities");
  validateArray(graph.statements, "graph.statements");
  const entities = graph.entities.map((entity) => {
    validateEntity(entity);
    return entity;
  });
  const statements = graph.statements.map((statement) => {
    validateObject(statement, "statement");
    const { status } = statement;
    validateChoice(status, ["active", "unresolved", "retired", "superseded"], "statement.status");
    validateStatementContent(statement);
    return { ...statement, status };
  });
  validateIds(
    entities.map(({ id }) => id),
    "entity IDs",
  );
  validateIds(
    statements.map(({ id }) => id),
    "statement IDs",
  );
  assertGraphReferences({ entities, statements });
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
}

function markInferencesForReview(statements: Map<string, Statement>) {
  for (const [id, statement] of statements) {
    if (
      !["active", "unresolved"].includes(statement.status) ||
      statement.origin.kind !== "inferred"
    )
      continue;
    const reviewNeeded = statement.origin.premises.filter(
      (premise) => statements.get(premise)!.status !== "active",
    );
    if (reviewNeeded.length) statements.set(id, { ...statement, reviewNeeded });
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
    const existing = statements.get(statement.id);
    const { reviewNeeded: _reviewNeeded, ...existingDeclaration } = existing ?? {};
    assertCondition(
      !existing || isDeepStrictEqual(existingDeclaration, statement),
      `Statement ${statement.id} is immutable; create a new statement`,
    );
    if (statement.scope.type === "work")
      assertCondition(knownWorkIds.has(statement.scope.id), `Unknown work: ${statement.scope.id}`);
    statements.set(statement.id, existing ?? statement);
    if (!existing) addedStatements.push(statement);
  }
  assertGraphReferences({ entities: [...entities.values()], statements: [...statements.values()] });
  applyStatementTransitions(statements, addedStatements, changes.retire);
  markInferencesForReview(statements);
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
