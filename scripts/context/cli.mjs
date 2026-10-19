import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseRecordId, parseRevisionNumber } from "./records.mjs";
import { remember, checkpoint } from "./legacy.mjs";
import { appendWorkNote } from "./journal.mjs";
import { eraseContext } from "./forget.mjs";
import { recallContext } from "./recall.mjs";
import {
  parseSourceReference,
  readSource,
  readSourceArchive,
  matchesContextScope,
} from "./sources.mjs";
import { rankSourcesByQuery } from "./search.mjs";
import { applyTidyChanges, prepareTidyBatch, readConsolidationHistory } from "./tidy.mjs";
import { getLatestConsolidation, calculateTidyStatus } from "./consolidation.mjs";
import { resolveProjectLocation } from "./store.mjs";
import { queryGraph } from "./graph-query.mjs";

const usage = `Usage: node <plugin>/scripts/context/cli.mjs <command> [options]

Commands:
  location    Show the resolved project and storage paths without creating files.
  recall      Read current project memories and work summaries.
  record      Append daily plain text from stdin: --work <id> --source <reference>.
  search      Rank original records with BM25: --query <text>.
  read        Read an exact original record: --ref <kind:id@revision>.
  graph       Read statements and their evidence paths: --entity <id> or --query <text>.
  tidy prepare  Freeze an unprocessed batch for the tidy skill.
  tidy apply    Apply grounded changes from JSON stdin using the prepared snapshot.
  tidy status   Show pending count and whether consolidation is due.
  remember    Create or revise a memory: --id <id>, JSON input.
  checkpoint  Save verified progress: --work <id>, JSON input.
  forget      Erase a memory: --id <id> --revision <n>; or a daily original: --ref note:work@n.

Options:
  --cwd <path>       Git checkout or worktree (default: current directory).
  --data-dir <path>  Absolute storage override (otherwise LOOM_DATA_DIR or OS default).
  --work <id>        Include this work's scoped memories and full checkpoint in recall.
  --query <text>     Filter recalled memories by words in current text and reason.
  --history         Include prior revisions in recall; current revisions are the default.
  --entity <id>      Start graph traversal at this entity.
  --depth <n>        Graph traversal depth, 1-5 (default: 2).
  --source <text>    Actual source of a daily record.
  --by <user|agent>  Source type for record (default: agent).
  --key <id>         Reuse a daily record's returned requestKey only when retrying it.
  --ref <reference>  Exact original reference returned by record, search or tidy.
  --limit <n>        Per-list/batch limit, 1-200 (search: 10; recall/prepare: 50).
  --offset <n>       Skip entries in recall lists or tidy prepare current-state lists.
  --input <path>    Read write-command JSON from a file instead of stdin.
  --help            Show usage.

Requires Node.js 20+ and Git. Use cli.sh (macOS/Linux) or cli.cmd (Windows) to diagnose missing Node.
Exit code 2 requests dependency setup by the agent; other failures use exit code 1.
Legacy remember/checkpoint inputs require expectedRevision; record does not.
See skills/work/references/context.md for schemas and recording policy.`;

function parseCommandLine() {
  const {
    values: options,
    positionals: words,
    tokens,
  } = parseArgs({
    allowPositionals: true,
    tokens: true,
    options: {
      cwd: { type: "string" },
      "data-dir": { type: "string" },
      id: { type: "string" },
      work: { type: "string" },
      revision: { type: "string" },
      query: { type: "string" },
      input: { type: "string" },
      history: { type: "boolean" },
      help: { type: "boolean" },
      source: { type: "string" },
      by: { type: "string" },
      key: { type: "string" },
      ref: { type: "string" },
      limit: { type: "string" },
      offset: { type: "string" },
      entity: { type: "string" },
      depth: { type: "string" },
    },
  });
  const names = tokens.filter(({ kind }) => kind === "option").map(({ name }) => name);
  if (new Set(names).size !== names.length) throw new Error("Options cannot be repeated");
  if (options.help) return { help: true };
  const command = words[0] === "tidy" ? `tidy:${words[1]}` : words[0];
  if (words.length !== (words[0] === "tidy" ? 2 : 1)) throw new Error(usage);
  const optionsByCommand = {
    location: [],
    recall: ["work", "query", "history", "limit", "offset", "entity", "depth"],
    remember: ["id", "input"],
    checkpoint: ["work", "input"],
    forget: ["id", "revision", "ref"],
    record: ["work", "source", "by", "key"],
    search: ["query", "work", "limit"],
    read: ["ref"],
    graph: ["work", "query", "history", "limit", "entity", "depth"],
    "tidy:prepare": ["limit", "offset"],
    "tidy:apply": ["input"],
    "tidy:status": [],
  };
  if (!Object.hasOwn(optionsByCommand, command))
    throw new Error(`Unknown command: ${command}\n${usage}`);
  const allowedOptions = ["cwd", "data-dir", ...optionsByCommand[command]];
  if (names.some((name) => !allowedOptions.includes(name)))
    throw new Error(`Unsupported option for ${command}`);
  if (command === "remember" || (command === "forget" && options.ref === undefined))
    parseRecordId(options.id);
  if (["checkpoint", "record"].includes(command) || options.work !== undefined)
    parseRecordId(options.work);
  if (
    options.limit !== undefined &&
    (!/^[1-9][0-9]*$/.test(options.limit) || Number(options.limit) > 200)
  ) {
    throw new Error("--limit must be an integer from 1 to 200");
  }
  options.limit =
    options.limit === undefined ? (command === "search" ? 10 : 50) : Number(options.limit);
  if (
    options.offset !== undefined &&
    (!/^\d+$/.test(options.offset) || !Number.isSafeInteger(Number(options.offset)))
  ) {
    throw new Error("--offset must be a non-negative integer");
  }
  options.offset = Number(options.offset ?? 0);
  if (options.entity !== undefined) parseRecordId(options.entity);
  if (options.entity !== undefined && options.query !== undefined)
    throw new Error("Choose --entity or --query for graph lookup");
  if (options.depth !== undefined && !/^[1-5]$/.test(options.depth))
    throw new Error("--depth must be an integer from 1 to 5");
  options.depth = Number(options.depth ?? 2);
  if (command === "search" && !options.query?.trim())
    throw new Error("search requires --query <text>");
  if (command === "read" && !options.ref) throw new Error("read requires --ref <kind:id@revision>");
  if (command === "forget") {
    if (options.ref !== undefined) {
      const note = parseSourceReference(options.ref);
      if (options.id !== undefined || options.revision !== undefined || note.kind !== "note") {
        throw new Error("forget --ref requires only a note reference");
      }
      options.erasureRequest = { note };
    } else {
      if (!/^\d+$/.test(options.revision ?? "")) throw new Error("forget requires --revision <n>");
      options.revision = parseRevisionNumber(Number(options.revision));
      options.erasureRequest = { memoryId: options.id, expectedRevision: options.revision };
    }
  }
  return { command, options };
}

function readJsonInput(inputPath) {
  if (inputPath === undefined && process.stdin.isTTY)
    throw new Error("Provide JSON via --input or stdin");
  try {
    return JSON.parse(readFileSync(inputPath ?? 0, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON input: ${error.message}`);
  }
}

async function runCli() {
  if (Number(process.versions.node.split(".")[0]) < 20) {
    throw Object.assign(
      new Error(
        `Node.js ${process.versions.node} is unsupported. The agent should configure a supported Node.js LTS (20+), verify node --version, and retry this command.`,
      ),
      { code: "LOOM_NODE_UNSUPPORTED" },
    );
  }
  const parsed = parseCommandLine();
  if (parsed.help) {
    console.log(usage);
    return;
  }
  const { command, options } = parsed;
  let writeInput;
  if (["remember", "checkpoint", "tidy:apply"].includes(command))
    writeInput = readJsonInput(options.input);
  const location = await resolveProjectLocation({
    cwd: options.cwd,
    directory: options["data-dir"],
  });
  let result;
  switch (command) {
    case "location":
      result = location;
      break;
    case "recall":
      result = await recallContext(location, options);
      break;
    case "graph": {
      const [archive, history] = await Promise.all([
        readSourceArchive(location),
        readConsolidationHistory(location),
      ]);
      result = queryGraph(getLatestConsolidation(history), archive, options);
      break;
    }
    case "record":
      result = await appendWorkNote(location, {
        work: options.work,
        text: readFileSync(0, "utf8"),
        key: options.key,
        source: { type: options.by ?? "agent", reference: options.source },
      });
      break;
    case "search": {
      const sourceArchive = await readSourceArchive(location);
      const matchingSources =
        options.work === undefined
          ? sourceArchive.sources
          : sourceArchive.sources.filter((source) => matchesContextScope(source, options.work));
      result = { results: rankSourcesByQuery(matchingSources, options.query, options.limit) };
      break;
    }
    case "read":
      result = await readSource(location, options.ref);
      break;
    case "tidy:prepare":
      result = await prepareTidyBatch(location, options.limit, options.offset);
      break;
    case "tidy:apply":
      result = await applyTidyChanges(location, writeInput);
      break;
    case "tidy:status": {
      const [sourceArchive, consolidationHistory] = await Promise.all([
        readSourceArchive(location),
        readConsolidationHistory(location),
      ]);
      result = calculateTidyStatus(sourceArchive, getLatestConsolidation(consolidationHistory));
      break;
    }
    case "remember":
      result = await remember(location, options.id, writeInput);
      break;
    case "checkpoint":
      result = await checkpoint(location, options.work, writeInput);
      break;
    case "forget":
      result = await eraseContext(location, options.erasureRequest);
      break;
  }
  console.log(JSON.stringify(result, null, 2));
}

try {
  await runCli();
} catch (error) {
  console.error(`Loom context: ${error.code ? `[${error.code}] ` : ""}${error.message}`);
  process.exitCode = ["LOOM_NODE_UNSUPPORTED", "LOOM_GIT_MISSING", "LOOM_GIT_UNUSABLE"].includes(
    error.code,
  )
    ? 2
    : 1;
}
