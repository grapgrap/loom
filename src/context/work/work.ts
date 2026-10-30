import type { Check, Criterion, Work, WorkRevision, WorkLedger, VisibleWork } from "./model.ts";
import type { QueryOptions, RecordSource } from "../model.ts";

type WorkInput = {
  expectedRevision: number;
  actor: string;
  source: RecordSource;
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

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

export function parseWorkLedger(input: unknown): WorkLedger {
  const ledger = input as WorkLedger;
  validateObject(ledger, "work ledger");
  requireCondition(ledger.version === 1, "Unsupported work ledger version");
  validateArray(ledger.works, "works");
  ids(
    ledger.works.map(({ id }) => id),
    "work IDs",
  );
  for (const record of ledger.works) {
    validateArray(record.revisions, "work revisions");
    requireCondition(record.revisions.length > 0, "Work needs a revision");
    record.revisions.forEach((work, index) => {
      requireCondition(
        work.id === record.id && work.revision === index + 1,
        "Invalid work revision identity",
      );
      requireCondition(Number.isFinite(Date.parse(work.recordedAt)), "Invalid work timestamp");
      parseRevisionNumber(work.definitionRevision, "definitionRevision");
      requireCondition(work.definitionRevision > 0, "Work definition revision must be positive");
      parseRecordId(work.owner, "owner");
      parseRecordId(work.actor, "actor");
      validateRecordSource(work.source);
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
      if (work.assignment !== null) {
        parseRecordId(work.assignment.worker, "worker");
        parseRecordId(work.assignment.reviewer, "reviewer");
        requireCondition(
          work.assignment.worker !== work.assignment.reviewer,
          "Worker and reviewer must differ",
        );
        if (work.assignment.executionId !== null)
          validateText(work.assignment.executionId, "executionId");
      }
      if (work.submission !== null) {
        validateText(work.submission.ref, "submission.ref");
        parseRevisionNumber(work.submission.definitionRevision);
        validateText(work.submission.summary, "submission.summary");
        texts(work.submission.artifacts, "submission.artifacts");
      }
    });
  }
  const works = currentWorks(ledger);
  validateRelations(works);
  for (const work of works.values()) {
    if (["complete", "submitted"].includes(work.status)) assertFinished(work, works);
    if (work.status === "submitted")
      requireCondition(
        work.assignment !== null && work.submission?.review === null,
        "Submitted work needs a pending assigned result",
      );
    if (work.status === "complete" && work.assignment !== null)
      requireCondition(
        work.submission?.review?.verdict === "accepted",
        "Assigned completion needs reviewer acceptance",
      );
  }
  return ledger;
}

function validateChecks(value: unknown, work: Work): asserts value is Check[] {
  const checks = value as Check[];
  validateArray(checks, "checks");
  const known = new Set(work.criteria.map(({ id }) => id));
  for (const check of checks) {
    fields(check, ["criterionId", "verdict", "observation", "evidence"], "check");
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
  }
  ids(
    checks.map(({ criterionId }) => criterionId),
    "reported criterion IDs",
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

function worker(work: Work) {
  return work.assignment?.worker ?? work.owner;
}

function assertOwner(work: Work, actor: string) {
  requireCondition(work.owner === actor, `Only work owner ${work.owner} can change its plan`);
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
      assertOwner(work, input.actor);
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
      assertOwner(work, input.actor);
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
      requireCondition(
        worker(work) === input.actor,
        `Only assigned worker ${worker(work)} can report`,
      );
      assertExecuting(work);
      validateText(input.progress, "progress");
      texts(input.next, "next");
      const checks = input.checks ?? [];
      validateChecks(checks, work);
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
      requireCondition(
        work.assignment && worker(work) === input.actor,
        "Only an assigned worker can submit a result",
      );
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
        work.assignment?.reviewer === input.actor,
        `Only reviewer ${work.assignment?.reviewer ?? "(unassigned)"} can review`,
      );
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
      assertOwner(work, input.actor);
      requireCondition(
        work.assignment === null,
        "Assigned work needs submission and reviewer acceptance",
      );
      requireCondition(work.status === "active", "Only active work can complete");
      assertFinished(work, works);
      work.status = "complete";
      break;
    case "cancel":
      assertOwner(work, input.actor);
      validateText(input.reason, "reason");
      work.status = "cancelled";
      work.progress = input.reason;
      work.next = [];
      work.submission = null;
      break;
    case "reopen":
      assertOwner(work, input.actor);
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
  fields(input, ["expectedRevision", "actor", "source", ...actions[action]], action);
  parseRevisionNumber(input.expectedRevision, "expectedRevision");
  parseRecordId(input.actor, "actor");
  validateRecordSource(input.source);
  const current = currentWorks(ledger).get(id);
  const requestHash = createHash("sha256").update(JSON.stringify({ action, input })).digest("hex");
  if (current?.revision === input.expectedRevision + 1 && current.requestHash === requestHash)
    return ledger!;
  requireCondition(
    (current?.revision ?? 0) === input.expectedRevision,
    `Work revision conflict: current revision is ${current?.revision ?? 0}; show and reconcile before retrying`,
  );
  const nextLedger = structuredClone(ledger ?? { version: 1, works: [] });
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
