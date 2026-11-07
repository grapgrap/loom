import type { Check, Criterion, Work, WorkRevision, WorkLedger, VisibleWork } from "./model.ts";
import type { QueryOptions, RecordSource } from "../model.ts";

type WorkInput = {
  expectedRevision: number;
  actor: string;
  source: RecordSource;
  requestKey?: string;
  goal: string;
  scope: string;
  criteria: Criterion[] | string[];
  parent?: string;
  contributesTo?: string[];
  dependsOn?: string[];
  required?: boolean;
  next: string[];
  adopt?: boolean;
  reason: string;
  worker: string;
  reviewer: string;
  executionId?: string;
  progress: string;
  checks?: Check[];
  status?: "active" | "blocked" | "paused";
  summary: string;
  artifacts?: string[];
  submission: string;
  evidence: string[];
};
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  parseRecordId,
  parseRevisionNumber,
  validateArray,
  validateChoice,
  validateObject,
  validateRecordSource,
  validateText,
} from "../records/records.ts";

const actions: Record<string, string[]> = {
  create: [
    "goal",
    "scope",
    "criteria",
    "parent",
    "contributesTo",
    "dependsOn",
    "required",
    "next",
    "adopt",
  ],
  revise: ["goal", "scope", "criteria", "contributesTo", "dependsOn", "required", "reason"],
  assign: ["worker", "reviewer", "executionId"],
  report: ["progress", "next", "checks", "status"],
  submit: ["summary", "artifacts"],
  accept: ["submission", "reason", "evidence"],
  "request-changes": ["submission", "reason", "criteria"],
  complete: [],
  cancel: ["reason"],
  reopen: ["reason"],
};

function requireCondition(
  condition: unknown,
  message: string,
  outcome: "rejected" | "conflict" = "rejected",
): asserts condition {
  if (!condition) throw Object.assign(new Error(message), { outcome });
}

function fields(value: unknown, allowed: string[], label: string) {
  validateObject(value, label);
  for (const key of Object.keys(value))
    requireCondition(allowed.includes(key), `Unknown ${label} field: ${key}`);
}

function texts(value: unknown, label: string): string[] {
  validateArray(value, label);
  value.forEach((entry, index) => validateText(entry, `${label}[${index}]`));
  return value as string[];
}

function ids(input: unknown, label: string): string[] {
  const value = texts(input, label);
  value.forEach((id) => parseRecordId(id, label));
  requireCondition(new Set(value).size === value.length, `Duplicate ${label}`);
  return value as string[];
}

function criteria(input: unknown): Criterion[] {
  const value = input as Criterion[];
  validateArray(value, "criteria");
  requireCondition(value.length > 0, "At least one acceptance criterion is required");
  value.forEach((entry) => {
    fields(entry, ["id", "description", "verification"], "criterion");
    parseRecordId(entry.id, "criterion.id");
    validateText(entry.description, "criterion.description");
    validateText(entry.verification, "criterion.verification");
  });
  ids(
    value.map(({ id }) => id),
    "criterion IDs",
  );
  return value;
}

export function currentWorks(ledger: WorkLedger | null) {
  return new Map((ledger?.works ?? []).map((record) => [record.id, record.revisions.at(-1)!]));
}

export function findRequest(ledger: WorkLedger | null, key: string) {
  return ledger?.works
    .flatMap(({ revisions }) => revisions)
    .find(({ requestKey }) => requestKey === key);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

export function parseWorkLedger(input: unknown): WorkLedger {
  const ledger = input as WorkLedger;
  validateObject(ledger, "work ledger");
  requireCondition([1, 2].includes(ledger.version), "Unsupported work ledger version");
  validateArray(ledger.works, "works");
  ids(
    ledger.works.map(({ id }) => id),
    "work IDs",
  );
  const requestKeys = new Set<string>();
  for (const record of ledger.works) {
    validateArray(record.revisions, "work revisions");
    requireCondition(record.revisions.length > 0, "Work needs a revision");
    record.revisions.forEach((work, index) => {
      requireCondition(
        work.id === record.id && work.revision === index + 1,
        "Invalid work revision identity",
      );
      validateText(work.recordedAt, "work.recordedAt");
      requireCondition(Number.isFinite(Date.parse(work.recordedAt)), "Invalid work timestamp");
      parseRevisionNumber(work.definitionRevision, "definitionRevision");
      requireCondition(work.definitionRevision > 0, "Work definition revision must be positive");
      parseRecordId(work.owner, "owner");
      parseRecordId(work.actor, "actor");
      validateRecordSource(work.source);
      if (work.requestKey !== undefined) {
        parseRecordId(work.requestKey, "requestKey");
        requireCondition(ledger.version === 2, "Request keys require work ledger version 2");
        requireCondition(!requestKeys.has(work.requestKey), "Duplicate work request key");
        requestKeys.add(work.requestKey);
        requireCondition(
          typeof work.requestHash === "string" && /^[a-f0-9]{64}$/.test(work.requestHash),
          "A work request key needs its payload hash",
        );
        requireCondition(work.action !== "invalidated", "Invalidation cannot own a request key");
      }
      validateText(work.goal, "goal");
      validateText(work.scope, "scope");
      validateText(work.progress, "progress");
      texts(work.next, "next");
      criteria(work.criteria);
      ids(work.dependsOn, "dependsOn");
      ids(work.contributesTo, "contributesTo");
      requireCondition(typeof work.required === "boolean", "required must be a boolean");
      if (work.parent !== null) parseRecordId(work.parent, "parent");
      validateChoice(
        work.status,
        ["active", "blocked", "paused", "submitted", "complete", "cancelled"],
        "status",
      );
      validateChecks(work.checks, work);
      if (
        work.requestKey !== undefined &&
        ["report", "submit", "complete", "accept"].includes(work.action)
      )
        requireBasis(
          work.checks,
          work.action === "report" ? record.revisions[index - 1]?.checks : [],
        );
      if (work.assignment !== null) {
        validateObject(work.assignment, "assignment");
        parseRecordId(work.assignment.worker, "worker");
        parseRecordId(work.assignment.reviewer, "reviewer");
        requireCondition(
          work.assignment.worker !== work.assignment.reviewer,
          "Worker and reviewer must differ",
        );
        if (work.assignment.executionId !== null)
          validateText(work.assignment.executionId, "executionId");
      }
      validateSubmission(work, record.revisions);
      for (const check of [...work.checks, ...(work.submission?.checks ?? [])])
        if (check.basis)
          validateBasisReference(check, work.id, record.revisions.slice(0, index + 1));
    });
  }
  const works = currentWorks(ledger);
  validateRelations(works);
  for (const work of works.values())
    if (["complete", "submitted"].includes(work.status)) assertFinished(work, works);
  return ledger;
}

function validateSubmission(work: WorkRevision, revisions: WorkRevision[]) {
  const submission = work.submission;
  if (submission === null) {
    requireCondition(work.status !== "submitted", "Submitted work needs a submission");
    requireCondition(
      work.status !== "complete" || work.assignment === null,
      "Assigned completion needs reviewer acceptance",
    );
    return;
  }
  validateObject(submission, "submission");
  requireCondition(work.assignment !== null, "Submission needs an assignment");
  validateText(submission.ref, "submission.ref");
  requireCondition(
    work.action !== "submit" || submission.ref === `work:${work.id}@${work.revision}`,
    "submission.ref must identify its creation revision",
  );
  parseRevisionNumber(submission.definitionRevision, "submission.definitionRevision");
  requireCondition(
    submission.definitionRevision === work.definitionRevision,
    "Submission definition is stale",
  );
  validateText(submission.summary, "submission.summary");
  texts(submission.artifacts, "submission.artifacts");
  validateChecks(submission.checks, work, "submission.checks");
  requireCondition(
    submission.checks.length === work.criteria.length &&
      submission.checks.every(({ verdict }) => verdict === "met"),
    "Submission needs verified checks for every criterion",
  );
  const review = submission.review;
  if (review !== null) {
    validateObject(review, "submission.review");
    validateChoice(review.verdict, ["accepted", "changes-requested"], "submission.review.verdict");
    parseRecordId(review.actor, "submission.review.actor");
    requireCondition(
      review.actor === work.owner || review.actor === work.assignment.reviewer,
      "Submission review must identify the work owner or historical assigned reviewer",
    );
    validateText(review.reason, "submission.review.reason");
    texts(review.evidence, "submission.review.evidence");
    requireCondition(
      review.verdict !== "accepted" || review.evidence.length > 0,
      "Accepted submission review needs evidence",
    );
    validateRecordSource(review.source);
  }
  const expectedReview =
    work.status === "submitted"
      ? null
      : work.status === "complete"
        ? "accepted"
        : "changes-requested";
  requireCondition(
    work.status !== "cancelled" &&
      (expectedReview === null ? review === null : review?.verdict === expectedReview),
    "Submission review does not match the work status",
  );
  if (["submitted", "complete"].includes(work.status))
    requireCondition(
      work.next.length === 0 && isDeepStrictEqual(work.checks, submission.checks),
      "Finished work must preserve its submitted checks and have no next actions",
    );

  // A changes-requested result retains the old snapshot while live checks are revised.
  const original = revisions.find(
    ({ revision }) => `work:${work.id}@${revision}` === submission.ref && revision <= work.revision,
  );
  requireCondition(
    original?.action === "submit" &&
      original.status === "submitted" &&
      original.submission?.ref === submission.ref &&
      original.submission.review === null,
    "submission.ref must identify a submitted revision of this work",
  );
  requireCondition(
    original.definitionRevision === submission.definitionRevision &&
      original.submission.summary === submission.summary &&
      isDeepStrictEqual(original.submission.artifacts, submission.artifacts) &&
      isDeepStrictEqual(original.submission.checks, submission.checks),
    "Submission payload differs from its submitted revision",
  );
}

function validateChecks(value: unknown, work: Work, label = "checks"): asserts value is Check[] {
  const checks = value as Check[];
  validateArray(checks, label);
  const known = new Set(work.criteria.map(({ id }) => id));
  for (const check of checks) {
    fields(check, ["criterionId", "verdict", "observation", "evidence", "basis"], "check");
    requireCondition(
      known.has(check.criterionId as string),
      `Unknown criterion: ${check.criterionId}`,
    );
    validateChoice(check.verdict, ["met", "unmet", "unknown"], "check.verdict");
    validateText(check.observation, "check.observation");
    texts(check.evidence, "check.evidence");
    requireCondition(
      check.verdict !== "met" || check.evidence.length > 0,
      "A met criterion needs evidence",
    );
    if (check.basis !== undefined) {
      fields(check.basis, ["work", "definition", "target", "version", "conditions"], "basis");
      validateText(check.basis.work, "basis.work");
      parseRevisionNumber(check.basis.definition, "basis.definition");
      requireCondition(check.basis.definition > 0, "basis.definition must be positive");
      validateText(check.basis.target, "basis.target");
      validateText(check.basis.version, "basis.version");
      texts(check.basis.conditions, "basis.conditions");
    }
  }
  ids(
    checks.map(({ criterionId }) => criterionId),
    "reported criterion IDs",
  );
}

function validateBasisReference(check: Check, id: string, revisions: WorkRevision[]) {
  const basis = check.basis!;
  const observed = revisions.find((work) => basis.work === `work:${id}@${work.revision}`);
  requireCondition(observed, `Unknown observed work ref: ${basis.work}`);
  requireCondition(
    basis.definition === observed.definitionRevision,
    "Check basis definition does not match its observed work ref",
  );
}

function requireBasis(checks: Check[], preserved: Check[] = []) {
  for (const check of checks)
    requireCondition(
      check.verdict !== "met" ||
        check.basis !== undefined ||
        preserved.some((previous) => isDeepStrictEqual(previous, check)),
      "A newly verified criterion needs an observed basis; legacy checks cannot be promoted",
    );
}

function validateRelations(works: Map<string, Work>) {
  for (const work of works.values()) {
    for (const dependency of work.dependsOn)
      requireCondition(works.has(dependency), `Unknown dependency: ${dependency}`);
    if (work.parent === null) {
      requireCondition(
        work.contributesTo.length === 0,
        "A root work cannot contribute to a parent criterion",
      );
    } else {
      const parent = works.get(work.parent);
      requireCondition(parent, `Unknown parent: ${work.parent}`);
      requireCondition(
        work.contributesTo.length > 0,
        "A child must contribute to a parent criterion",
      );
      for (const id of work.contributesTo)
        requireCondition(
          parent.criteria.some((criterion) => criterion.id === id),
          `Unknown parent criterion: ${id}`,
        );
    }
  }
  const visited = new Set();
  const visiting = new Set();
  function visit(id: string) {
    if (visited.has(id)) return;
    requireCondition(!visiting.has(id), `Work dependency cycle at ${id}`);
    visiting.add(id);
    const work = works.get(id)!;
    const children = [...works.values()].filter((child) => child.parent === id);
    for (const next of [...work.dependsOn, ...children.map((child) => child.id)]) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of works.keys()) visit(id);
}

function assertOwner(work: Work, actor: string) {
  requireCondition(work.owner === actor, `Only work owner ${work.owner} can change its state`);
}

function assertExecuting(work: Work) {
  requireCondition(
    ["active", "blocked", "paused"].includes(work.status),
    `Work is ${work.status}; revise or reopen it before reporting`,
  );
}

function unfinishedRequirements(work: Work, works: Map<string, Work>) {
  const missing = work.criteria.filter(
    ({ id }) => !work.checks.some((check) => check.criterionId === id && check.verdict === "met"),
  );
  const dependencies = work.dependsOn.filter((id) => works.get(id)!.status !== "complete");
  const children = [...works.values()].filter(
    (child) => child.parent === work.id && child.required && child.status !== "complete",
  );
  return { missing, dependencies, children };
}

function assertFinished(work: Work, works: Map<string, Work>) {
  const remaining = unfinishedRequirements(work, works);
  requireCondition(
    remaining.missing.length === 0,
    `Unverified criteria: ${remaining.missing.map(({ id }) => id).join(", ")}`,
  );
  requireCondition(
    remaining.dependencies.length === 0,
    `Incomplete dependencies: ${remaining.dependencies.join(", ")}`,
  );
  requireCondition(
    remaining.children.length === 0,
    `Incomplete child work: ${remaining.children.map(({ id }) => id).join(", ")}`,
  );
  requireCondition(work.next.length === 0, "Remaining next actions prevent completion");
}

function invalidate(work: Work, reason: string, affected: Set<string> | null = null) {
  work.definitionRevision += 1;
  work.checks =
    affected === null ? [] : work.checks.filter(({ criterionId }) => !affected.has(criterionId));
  work.submission = null;
  if (["complete", "submitted"].includes(work.status)) work.status = "active";
  work.recheckReason = reason;
  if (!["blocked", "paused", "cancelled"].includes(work.status)) work.progress = reason;
  if (work.next.length === 0 && work.status !== "cancelled")
    work.next = ["Recheck the affected criteria and report current evidence"];
}

function applyAction(
  work: Work,
  works: Map<string, Work>,
  action: string,
  input: WorkInput,
  nextRevision: number,
) {
  switch (action) {
    case "revise": {
      validateText(input.reason, "reason");
      for (const field of [
        "goal",
        "scope",
        "criteria",
        "contributesTo",
        "dependsOn",
        "required",
      ] as const)
        if (input[field] !== undefined)
          Object.assign(work, { [field]: structuredClone(input[field]) });
      criteria(work.criteria);
      validateText(work.goal, "goal");
      validateText(work.scope, "scope");
      ids(work.contributesTo, "contributesTo");
      ids(work.dependsOn, "dependsOn");
      requireCondition(typeof work.required === "boolean", "required must be a boolean");
      invalidate(work, input.reason);
      break;
    }
    case "assign":
      parseRecordId(input.worker, "worker");
      parseRecordId(input.reviewer, "reviewer");
      requireCondition(input.worker !== input.reviewer, "Worker and reviewer must differ");
      if (input.executionId !== undefined) validateText(input.executionId, "executionId");
      if (work.assignment?.worker === input.worker && work.assignment.reviewer === input.reviewer) {
        work.assignment.executionId = input.executionId ?? work.assignment.executionId;
        break;
      }
      assertExecuting(work);
      work.assignment = {
        worker: input.worker,
        reviewer: input.reviewer,
        executionId: input.executionId ?? null,
      };
      invalidate(work, "Assigned; current worker verification is required");
      break;
    case "report": {
      assertExecuting(work);
      validateText(input.progress, "progress");
      texts(input.next, "next");
      const checks = input.checks ?? [];
      if (checks.some(({ verdict }) => verdict === "met"))
        requireCondition(
          work.dependsOn.every((id) => works.get(id)!.status === "complete"),
          "Incomplete dependencies prevent verified results",
        );
      validateChoice(input.status ?? work.status, ["active", "blocked", "paused"], "report.status");
      work.status = input.status ?? work.status;
      requireCondition(
        work.status === "active" || input.next.length > 0,
        "Blocked or paused work needs next actions and a resumption condition in progress",
      );
      work.progress = input.progress;
      work.next = input.next;
      const combined = new Map(work.checks.map((check) => [check.criterionId, check]));
      for (const check of checks) combined.set(check.criterionId, check);
      work.checks = [...combined.values()];
      break;
    }
    case "submit":
      requireCondition(work.assignment, "Only assigned work can have a submitted result");
      requireCondition(work.status === "active", "Only active work can be submitted");
      assertFinished(work, works);
      validateText(input.summary, "summary");
      texts(input.artifacts ?? [], "artifacts");
      work.submission = {
        ref: `work:${work.id}@${nextRevision}`,
        definitionRevision: work.definitionRevision,
        summary: input.summary,
        artifacts: input.artifacts ?? [],
        checks: structuredClone(work.checks),
        review: null,
      };
      work.status = "submitted";
      break;
    case "accept":
    case "request-changes": {
      requireCondition(
        work.status === "submitted" && work.submission?.ref === input.submission,
        "Submission is missing, stale or no longer awaiting review",
      );
      requireCondition(
        work.submission.definitionRevision === work.definitionRevision,
        "Submission definition is stale",
      );
      validateText(input.reason, "reason");
      if (action === "accept") {
        texts(input.evidence, "review.evidence");
        requireCondition(input.evidence.length > 0, "Acceptance needs review evidence");
        assertFinished(work, works);
        work.status = "complete";
      } else {
        const rejected = ids(
          input.criteria ?? work.criteria.map(({ id }) => id),
          "review criteria",
        );
        requireCondition(
          rejected.length > 0 &&
            rejected.every((id) => work.criteria.some((criterion) => criterion.id === id)),
          "Review must identify existing criteria to recheck",
        );
        work.checks = work.checks.filter(({ criterionId }) => !rejected.includes(criterionId));
        work.status = "active";
        work.next = [input.reason];
      }
      work.progress = input.reason;
      work.submission.review = {
        verdict: action === "accept" ? "accepted" : "changes-requested",
        actor: input.actor,
        reason: input.reason,
        evidence: input.evidence ?? [],
        source: input.source,
      };
      break;
    }
    case "complete":
      requireCondition(
        work.assignment === null,
        "Assigned work needs submission and reviewer acceptance",
      );
      requireCondition(work.status === "active", "Only active work can complete");
      assertFinished(work, works);
      work.status = "complete";
      break;
    case "cancel":
      validateText(input.reason, "reason");
      work.status = "cancelled";
      work.progress = input.reason;
      work.next = [];
      work.submission = null;
      break;
    case "reopen":
      validateText(input.reason, "reason");
      work.status = "active";
      invalidate(work, input.reason);
      break;
    default:
      throw new Error(`Unknown work action: ${action}`);
  }
}

function appendRevision(
  ledger: WorkLedger,
  work: Work,
  action: string,
  input: WorkInput,
  recordedAt: string,
  requestHash: string | null = null,
) {
  let record = ledger.works.find(({ id }) => id === work.id);
  if (!record) {
    record = { id: work.id, revisions: [] };
    ledger.works.push(record);
  }
  const revision = {
    ...work,
    revision: record.revisions.length + 1,
    recordedAt,
    action,
    actor: input.actor,
    source: input.source,
    requestHash,
    requestKey: requestHash === null ? undefined : input.requestKey,
  };
  record.revisions.push(revision);
  return revision;
}

function invalidateConsumers(
  ledger: WorkLedger,
  changed: WorkRevision,
  previousWork: WorkRevision | undefined,
  input: WorkInput,
  recordedAt: string,
) {
  const works = currentWorks(ledger);
  const affected = new Map<string, Set<string> | null>();
  const visited = new Set([changed.id]);
  const queue = [changed.id];
  while (queue.length) {
    const id = queue.shift()!;
    const work = works.get(id)!;
    for (const consumer of works.values()) {
      if (consumer.id !== work.parent && !consumer.dependsOn.includes(id)) continue;
      const previous = affected.get(consumer.id);
      const previousContribution =
        id === changed.id && previousWork?.parent === consumer.id ? previousWork.contributesTo : [];
      const incoming = consumer.dependsOn.includes(id)
        ? null
        : new Set([...work.contributesTo, ...previousContribution]);
      affected.set(
        consumer.id,
        previous === null || incoming === null ? null : new Set([...(previous ?? []), ...incoming]),
      );
      if (!visited.has(consumer.id)) {
        visited.add(consumer.id);
        queue.push(consumer.id);
      }
    }
  }
  for (const [id, criterionIds] of affected) {
    const work = structuredClone(works.get(id)!);
    invalidate(work, `Related work ${changed.id} changed; recheck affected evidence`, criterionIds);
    appendRevision(ledger, work, "invalidated", input, recordedAt);
  }
}

export function changeWork(
  ledger: WorkLedger | null,
  id: string,
  action: string,
  value: unknown,
  { legacyRef = null }: { legacyRef?: string | null } = {},
): WorkLedger {
  const input = value as WorkInput;
  parseRecordId(id, "work");
  requireCondition(Object.hasOwn(actions, action), `Unknown work action: ${action}`);
  fields(input, ["expectedRevision", "actor", "source", "requestKey", ...actions[action]], action);
  if (input.requestKey !== undefined) parseRecordId(input.requestKey, "requestKey");
  parseRevisionNumber(input.expectedRevision, "expectedRevision");
  parseRecordId(input.actor, "actor");
  validateRecordSource(input.source);
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify(
        input.requestKey === undefined ? { action, input } : canonical({ id, action, input }),
      ),
    )
    .digest("hex");
  const applied =
    input.requestKey === undefined ? undefined : findRequest(ledger, input.requestKey);
  if (applied) {
    requireCondition(
      applied.requestHash === requestHash,
      "The work request key was already used with a different payload",
    );
    return ledger!;
  }
  const current = currentWorks(ledger).get(id);
  if (current) assertOwner(current, input.actor);
  if (current?.revision === input.expectedRevision + 1 && current.requestHash === requestHash)
    return ledger!;
  requireCondition(
    (current?.revision ?? 0) === input.expectedRevision,
    `Work revision conflict: current revision is ${current?.revision ?? 0}; show and reconcile before retrying`,
    "conflict",
  );
  const nextLedger = structuredClone(ledger ?? { version: 2, works: [] });
  nextLedger.version = 2;
  const works = new Map<string, Work>(currentWorks(nextLedger));
  const recordedAt = new Date().toISOString();
  let work: Work;
  if (action === "create") {
    requireCondition(!current, `Work already exists: ${id}`);
    requireCondition(
      !legacyRef || input.adopt === true,
      "Legacy work exists; explicitly set adopt: true after reading its current state",
    );
    if (input.adopt !== undefined)
      requireCondition(typeof input.adopt === "boolean", "adopt must be boolean");
    validateText(input.goal, "goal");
    validateText(input.scope, "scope");
    criteria(input.criteria);
    const parent = input.parent ?? null;
    if (parent !== null) {
      parseRecordId(parent, "parent");
      requireCondition(works.has(parent), `Unknown parent: ${parent}`);
      assertOwner(works.get(parent)!, input.actor);
    }
    const required = input.required ?? true;
    requireCondition(typeof required === "boolean", "required must be boolean");
    work = {
      id,
      definitionRevision: 1,
      owner: input.actor,
      goal: input.goal,
      scope: input.scope,
      criteria: criteria(input.criteria),
      parent,
      contributesTo: ids(input.contributesTo ?? [], "contributesTo"),
      dependsOn: ids(input.dependsOn ?? [], "dependsOn"),
      required,
      assignment: null,
      status: "active",
      progress: "Work defined; execution and verification remain",
      next: texts(input.next ?? [input.goal], "next"),
      checks: [],
      submission: null,
      ...(legacyRef === null ? {} : { legacyRef }),
    };
  } else {
    requireCondition(current, `Unknown work: ${id}`);
    if (input.requestKey !== undefined && ["submit", "complete", "accept"].includes(action))
      requireBasis(current.checks);
    if (action === "report") {
      validateChecks(input.checks ?? [], current);
      if (input.requestKey !== undefined) requireBasis(input.checks ?? []);
      for (const check of input.checks ?? []) {
        if (check.basis) {
          validateBasisReference(
            check,
            id,
            ledger!.works.find((record) => record.id === id)!.revisions,
          );
          requireCondition(
            check.basis.definition === current.definitionRevision,
            "Check basis definition is stale; read the current work and verify its definition",
            "conflict",
          );
        }
      }
    }
    work = structuredClone(current);
    applyAction(work, works, action, input, current.revision + 1);
  }
  works.set(id, work);
  validateRelations(works);
  const saved = appendRevision(nextLedger, work, action, input, recordedAt, requestHash);
  if (
    ["create", "revise", "request-changes", "cancel", "reopen"].includes(action) ||
    (action === "assign" && current!.definitionRevision !== saved.definitionRevision) ||
    (action === "report" && !isDeepStrictEqual(current!.checks, saved.checks))
  )
    invalidateConsumers(nextLedger, saved, current, input, recordedAt);
  return nextLedger;
}

export function presentWork(work: WorkRevision, history?: WorkRevision[]): VisibleWork {
  const { requestHash: _requestHash, ...visible } = work;
  return {
    ...visible,
    managed: true,
    ref: `work:${work.id}@${work.revision}`,
    evidence: [
      ...new Set([
        ...work.checks.flatMap(({ evidence }) => evidence),
        ...(work.submission?.review?.evidence ?? []),
      ]),
    ],
    ...(history === undefined
      ? {}
      : { history: history.slice(0, -1).map((revision) => presentWork(revision)) }),
  };
}

export function showWork(
  ledger: WorkLedger | null,
  id: string,
  { tree = false, history = false }: QueryOptions = {},
) {
  const works = currentWorks(ledger);
  const work = works.get(id);
  requireCondition(work, `Unknown work: ${id}`);
  const selected = new Set([id]);
  if (tree) {
    for (const selectedId of selected)
      for (const candidate of works.values())
        if (candidate.parent === selectedId) selected.add(candidate.id);
  }
  const listed = [...selected].map((selectedId) => works.get(selectedId)!);
  function stoppedParent(entry: Work) {
    let parent = entry.parent === null ? null : works.get(entry.parent)!;
    while (parent) {
      if (["paused", "cancelled"].includes(parent.status)) return parent;
      parent = parent.parent === null ? null : works.get(parent.parent)!;
    }
    return null;
  }
  const missingCriteria = listed.flatMap((entry) =>
    unfinishedRequirements(entry, works).missing.map(({ id: criterionId }) => ({
      work: entry.id,
      criterionId,
    })),
  );
  return {
    work: presentWork(
      work,
      history ? ledger!.works.find((record) => record.id === id)!.revisions : undefined,
    ),
    children: [...works.values()]
      .filter((entry) => entry.parent === id)
      .map((entry) => presentWork(entry)),
    dependencies: work.dependsOn.map((dependency) => ({
      id: dependency,
      status: works.get(dependency)!.status,
    })),
    ...(tree ? { works: listed.map((entry) => presentWork(entry)) } : {}),
    ready: listed
      .filter(
        (entry) =>
          entry.status === "active" &&
          !stoppedParent(entry) &&
          entry.dependsOn.every((dependency) => works.get(dependency)!.status === "complete"),
      )
      .map(({ id }) => id),
    blocked: listed
      .filter(
        (entry) =>
          entry.status === "blocked" ||
          stoppedParent(entry) ||
          entry.dependsOn.some((dependency) => works.get(dependency)!.status !== "complete"),
      )
      .map((entry) => ({
        id: entry.id,
        status: entry.status,
        dependsOn: entry.dependsOn,
        ...(stoppedParent(entry) ? { stoppedBy: stoppedParent(entry)!.id } : {}),
      })),
    awaitingReview: listed.filter(({ status }) => status === "submitted").map(({ id }) => id),
    missingCriteria,
  };
}
