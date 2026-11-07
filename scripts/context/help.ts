type Command = { options: string[]; summary: string; input?: unknown; notes?: string };

const source = { type: "agent", reference: "Replace with the actual observation or request" };
const common = { requestKey: "example-1", expectedRevision: 1, actor: "main", source };
const applies = {
  target: "example",
  targetVersion: "observed-version",
  conditions: ["observed conditions"],
  lifetime: "until corrected",
};
const evidence = {
  requestKey: "capture-example-1",
  id: "example",
  scope: { type: "project" },
  kind: "observation",
  standing: "observed",
  text: "Replace with the actual observation.",
  applies,
  source,
  capture: "direct",
};
const evidenceNotes = `Required: requestKey, scope, kind, standing, text, applies, source, capture.
scope: {type:"project"} or {type:"work",id}. id is optional (generated when omitted).
kind: decision | correction | proposal | inference | observation.
standing: proposed | adopted | unresolved | observed. Newer revisions do not automatically replace older meaning.
capture: direct | reported | inferred. source.type: user | agent; reported/inferred require agent.
applies: target, conditions (array), lifetime; optional targetVersion identifies the applicability version.
Optional locator: {reference,version?,extent?} identifies the external source, not the applicability target.
Optional access: {status:"read",resolvedLocator,observedVersion?,capturedExtent},
  {status:"unavailable",reason}, or {status:"not-attempted"} (default).
Optional reason; units:[{id,start,end}] uses UTF-16 half-open ranges in text.
Output: outcome, ref, revision, requestKey, replayed, record.
Use actual sources and conditions; examples are shapes, not evidence. See skills/work/references/context-evidence.md.`;
const workNotes = `All work writes require expectedRevision, actor, source; use a unique requestKey for each new change.
create uses revision 0; later writes use work show's work.revision. actor is the owner identifier, not authentication.
Output: the work snapshot with ref, revision, definitionRevision, outcome, replayed.
On conflict reread the current definition and evidence before retrying. Lost replies: work result --key; show separately for current state.
See skills/work/references/context-work.md for completion, invalidation and authority rules.`;

export const commands: Record<string, Command> = {
  location: { options: [], summary: "Resolve project and storage paths without creating files." },
  recall: {
    options: ["work", "query", "history", "full", "limit", "offset", "entity", "depth"],
    summary: "Read current memories, work, pending originals and unfinished/review candidates.",
    notes:
      "--entity/--depth require --full; use graph for focused lookup. Field meanings: skills/work/references/context-query.md.",
  },
  remember: {
    options: ["id", "input"],
    summary: "Legacy memory writer: --id is required.",
    notes:
      "JSON stdin schema: skills/work/references/context-legacy.md. New decisions use evidence append.",
  },
  checkpoint: {
    options: ["work", "input"],
    summary: "Legacy work writer: --work is required.",
    notes:
      "JSON stdin schema: skills/work/references/context-legacy.md. Managed work rejects checkpoint writes.",
  },
  forget: {
    options: ["id", "revision", "ref"],
    summary:
      "Physically erase a memory (--id and --revision) or daily original (--ref note:work@n).",
    notes: "Deletion effects and authorization: skills/work/references/context-runtime.md.",
  },
  record: {
    options: ["work", "source", "by", "key"],
    summary: "Append plain text stdin to a daily original; requires --work and --source.",
    notes: "--key enables exact retry. New structured judgments use evidence append.",
  },
  search: {
    options: ["query", "work", "limit"],
    summary: "Rank original records by BM25; --query is required.",
  },
  discover: {
    options: ["query", "work", "limit", "cursor"],
    summary: "Find originals and derived vocabulary; --query is required.",
    notes:
      "Continue the same discovery with the returned cursor. Check coverage, gaps and remaining; a page is not exhaustive.",
  },
  "context:prepare": {
    options: ["input"],
    summary: "Gather work, discovery and correction bases for agent judgment.",
    input: { query: "example", work: "example", refs: [], limit: 10 },
    notes:
      "Only query is required. Optional work, refs (exact originals), limit (1–200), prior (the previous result's basis). Output: work, candidates, originals, changes, basis, coverage, next, gaps, refresh. changed/unchanged/unknown describe observed changes, not semantic applicability.",
  },
  "evidence:append": {
    options: ["input"],
    summary: "Append an immutable structured original from JSON stdin.",
    input: evidence,
    notes: evidenceNotes,
  },
  "evidence:correct": {
    options: ["input"],
    summary: "Link a correction, withdrawal or adoption to an exact evidence original.",
    input: {
      ...evidence,
      requestKey: "correct-example-1",
      kind: "correction",
      standing: "adopted",
      basis: "<basis returned by evidence check>",
      relation: { type: "replaces", target: "evidence:example@1", applies },
    },
    notes: `${evidenceNotes}\nAlso required: basis from evidence check, relation:{type,target,applies,selector?}. type: replaces | withdraws | adopts. selector:{unit} or {start,end}; check the same selector first. Proposed corrections do not change adopted decisions. Do not invent basis or infer an adoption.`,
  },
  "evidence:read": {
    options: ["ref"],
    summary: "Read an exact evidence original; --ref evidence:id@revision is required.",
  },
  "evidence:check": {
    options: ["input"],
    summary: "Read evidence originals and connected corrections from JSON stdin.",
    input: { seeds: ["evidence:example@1"] },
    notes:
      "seeds is required: an array of refs or {ref,selector:{unit}} / {ref,selector:{start,end}}. Optional at: current (default) or ledger position; budget: max originals; basis: previous check's basis. Output: records, relations, standings, conflicts, gaps, coverage, basis, change. Partial coverage is not proof of no change.",
  },
  "evidence:result": {
    options: ["key"],
    summary: "Recover the original write result by required --key; null means no stored receipt.",
  },
  read: {
    options: ["ref"],
    summary: "Read an exact original; --ref kind:id@revision is required.",
  },
  graph: {
    options: ["work", "query", "history", "limit", "entity", "depth"],
    summary: "Read statements and evidence paths; choose --entity or --query, not both.",
  },
  "tidy:prepare": {
    options: ["limit", "offset", "revisit", "work", "query", "purpose", "full"],
    summary: "Freeze originals and current representations for review.",
    notes:
      "Creates a stored snapshot, not a read-only query. Returns snapshot, batch, records, current, dependencies, remaining. Null snapshot: inspect reviewed and remaining. --offset applies to current lists, not pending originals. Review the exact batch before apply. Contract: skills/tidy/references/consolidation.md.",
  },
  "tidy:apply": {
    options: ["input", "full"],
    summary: "Apply a grounded review and optional memory changes from JSON stdin.",
    input: {
      snapshot: "<snapshot returned by tidy prepare>",
      requestKey: "tidy-example-1",
      reviewed: ["<exact batch ref>"],
      read: ["<exact batch ref>"],
      reason: "Replace with the actual review reason.",
      gaps: [],
    },
    notes:
      "Required for new calls: snapshot, requestKey, reviewed (exact batch), read (actually read refs including reviewed). Optional reason, gaps, memories, retire. When no memory changes are supplied, apply saves a review receipt without increasing the memory revision. Memory shape: {id,scope,text,reason,sources,status?,supersedes?}; status: active (default) | unresolved. retire:[{id,reason,sources}]. sources must be nonempty exact originals. Existing scope cannot change. Output: outcome, effect, revision, report, reviewed, remaining. Read skills/tidy/references/consolidation.md before constructing changes; legacy graph/works/absorb require legacy:true and the conditional legacy contract.",
  },
  "tidy:status": {
    options: ["work", "query", "purpose"],
    summary: "Read scoped review needs, pending records and size/growth signals.",
  },
  "tidy:result": {
    options: ["key"],
    summary: "Recover a committed review by required --key; null means no stored receipt.",
  },
  "work:show": {
    options: ["work", "tree", "history"],
    summary: "Read work, readiness and review gaps; --work is required.",
    notes:
      "Output includes work, children, ready, blocked, awaitingReview, missingCriteria; --tree includes descendants. Readiness does not indicate a host agent's execution state.",
  },
  "work:result": {
    options: ["key"],
    summary:
      "Recover an original work write by required --key; use show separately for current state.",
  },
};

const writes: Record<string, { summary: string; fields: Record<string, unknown>; notes?: string }> =
  {
    create: {
      summary: "Define a goal, scope and verifiable completion criteria.",
      fields: {
        expectedRevision: 0,
        goal: "Verify the example behavior.",
        scope: "The example path.",
        criteria: [
          {
            id: "done",
            description: "The expected behavior occurs.",
            verification: "Run the example path and inspect the result.",
          },
        ],
        next: ["Inspect current behavior."],
      },
      notes:
        "Required: goal, scope, nonempty criteria:[{id,description,verification}]. Optional next (defaults to goal), parent, contributesTo (parent criterion IDs), dependsOn (work IDs), required (default true), adopt (legacy work only). The creating actor becomes owner; child creation requires the parent's owner.",
    },
    revise: {
      summary: "Revise a definition and invalidate affected verification/submissions.",
      fields: { reason: "Agreed scope changed.", scope: "The revised example path." },
      notes:
        "Required reason; optional goal, scope, criteria, contributesTo, dependsOn, required. Do not weaken criteria to hide a failed result.",
    },
    assign: {
      summary: "Assign worker/reviewer identities; the owner still performs all writes.",
      fields: { worker: "builder", reviewer: "main" },
      notes:
        "Required distinct worker/reviewer; optional executionId links the host run. Changing identities invalidates verification; attaching executionId with the same identities preserves it.",
    },
    report: {
      summary: "Record progress, next actions and criterion observations.",
      fields: {
        progress: "Observed the example path.",
        next: [],
        checks: [
          {
            criterionId: "done",
            verdict: "met",
            observation: "Replace with the actual observation.",
            evidence: ["<actual output or artifact location>"],
            basis: {
              work: "work:example@1",
              definition: 1,
              target: "<observed artifact>",
              version: "<observed commit or hash>",
              conditions: ["<actual execution conditions>"],
            },
          },
        ],
      },
      notes:
        "Required progress and next. Optional status: active | blocked | paused; paused requires user instruction. Optional checks:[{criterionId,verdict,observation,evidence,basis?}]; verdict: met | unmet | unknown. A met check in a request with requestKey requires a real basis:{work,definition,target,version,conditions}. Omitted/empty checks preserve existing checks. Work revision, definition generation and observed artifact version are distinct.",
    },
    submit: {
      summary: "Freeze completed checks and artifacts for review.",
      fields: {
        summary: "Verified the example result.",
        artifacts: ["<actual artifact location>"],
      },
      notes:
        "Requires all criteria met, empty next, completed dependencies/required children. Assignment is required. Output includes the exact submission ref.",
    },
    accept: {
      summary: "Accept the currently submitted result after review.",
      fields: {
        submission: "<current submission ref>",
        reason: "Actual review rationale.",
        evidence: ["<actual review evidence>"],
      },
      notes:
        "Requires submission, reason and nonempty evidence. Owner records the review; reviewer reports through the host. Changes state to complete.",
    },
    "request-changes": {
      summary: "Return a submission for correction and clear affected checks.",
      fields: {
        submission: "<current submission ref>",
        reason: "Observed gap.",
        criteria: ["done"],
      },
      notes:
        "Required submission, reason; optional criteria (defaults to all). State returns to active.",
    },
    complete: {
      summary: "Complete unassigned work after its criteria and integration checks pass.",
      fields: {},
      notes:
        "All criteria met with valid basis, empty next, dependencies and required children complete. Assigned work must use submit and accept.",
    },
    cancel: {
      summary: "Cancel work with an authorized reason and clear next actions.",
      fields: { reason: "Actual cancellation instruction." },
      notes: "Cancelling a required child does not satisfy the parent's conditions.",
    },
    reopen: {
      summary: "Explicitly reopen work and invalidate previous verification/submission.",
      fields: { reason: "Actual instruction to resume." },
      notes: "Confirm current authorization to resume paused/cancelled work.",
    },
  };
for (const [action, value] of Object.entries(writes)) {
  commands[`work:${action}`] = {
    options: ["work", "input"],
    summary: `${value.summary} Requires --work <id>.`,
    input: { ...common, requestKey: `${action}-example-1`, ...value.fields },
    notes: `${value.notes ?? ""}\n${workNotes}`,
  };
}

const options: Record<string, string> = {
  cwd: "<path> Git checkout/worktree (default: current directory).",
  "data-dir": "<path> Absolute storage override (otherwise LOOM_DATA_DIR or OS default).",
  work: "<id> Work scope or identifier.",
  query: "<text> Query or filter text.",
  input:
    "<path> Read JSON from a file; default is stdin. Loom skills pass recording input through stdin.",
  history: "Include prior revisions.",
  full: "Include detailed results/graph where supported.",
  revisit: "Compatibility alias; prepare always includes current memories.",
  source: "<text> Actual source reference.",
  by: "<user|agent> Source type (default: agent).",
  key: "<id> Exact request key for retry/recovery.",
  ref: "<reference> Exact original reference.",
  limit: "<n> Per-list/batch limit, 1–200 (search/discover: 10; otherwise: 50).",
  offset: "<n> Skip current-list entries (default: 0).",
  entity: "<id> Graph starting entity.",
  depth: "<n> Graph depth, 1–5 (default: 2).",
  tree: "Include all descendants.",
  cursor: "<text> Continue the same discovery snapshot.",
  purpose: "<text> Review purpose (default: resume).",
  id: "<id> Record identifier.",
  revision: "<n> Current memory revision used to confirm erasure; all revisions are removed.",
  help: "Show help without accessing project storage.",
};

export function help(words: string[] = []): string {
  const name = words.join(":");
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  const matches = Object.keys(commands).filter((key) => !name || key.startsWith(`${name}:`));
  if (!command && !matches.length) {
    const group = words.length > 1 ? [words[0]] : [];
    throw new Error(`Unknown command: ${words.join(" ")}\n${help(group)}`);
  }
  if (!command)
    return `Usage: node <plugin>/scripts/context/cli.ts ${words.join(" ")} <command> [options]\n\nCommands:\n${matches.map((key) => `  ${key.replace(":", " ")}  ${commands[key].summary}`).join("\n")}\n\nUse <command> --help for allowed options, JSON examples and contracts.\nRequires Node.js 22.18+ in 22.x, 24.x, or 26+, and Git. cli.sh/cli.cmd diagnose dependencies (exit 2); other failures exit 1.`;
  const flags = ["cwd", "data-dir", ...command.options, "help"];
  return `Usage: node <plugin>/scripts/context/cli.ts ${words.join(" ")} [options]\n\n${command.summary}\n\nOptions:\n${flags.map((key) => `  --${key} ${options[key]}`).join("\n")}\n${command.input ? `\nJSON stdin example (replace factual values and <placeholders>):\n\`\`\`json\n${JSON.stringify(command.input, null, 2)}\n\`\`\`\n` : ""}${command.notes ? `\n${command.notes}\n` : ""}`;
}
