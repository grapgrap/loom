import { commands, help } from "./help.ts";
import type { ErasureRequest } from "../../src/context/operations/forget.ts";
import type { RecordSource } from "../../src/context/model.ts";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseRecordId, parseRevisionNumber } from "../../src/context/records/records.ts";
import { remember, checkpoint } from "../../src/context/operations/legacy.ts";
import { appendWorkNote } from "../../src/context/records/journal.ts";
import { eraseContext } from "../../src/context/operations/forget.ts";
import { recallContext } from "../../src/context/operations/recall.ts";
import {
  parseSourceReference,
  readSource,
  readSourceArchive,
  matchesContextScope,
} from "../../src/context/sources/sources.ts";
import { rankSourcesByQuery } from "../../src/context/sources/search.ts";
import {
  applyTidyChanges,
  prepareTidyBatch,
  readConsolidationHistory,
  result as readTidyResult,
  status as readTidyStatus,
} from "../../src/context/tidy/tidy.ts";
import { getLatestConsolidation } from "../../src/context/tidy/consolidation.ts";
import { resolveProjectLocation } from "../../src/context/storage/store.ts";
import { queryGraph } from "../../src/context/graph/query.ts";
import { runWorkCommand, readWorkResult } from "../../src/context/work/store.ts";
import * as evidence from "../../src/context/evidence/evidence.ts";
import { checkChanges } from "../../src/context/evidence/query.ts";
import { discover } from "../../src/context/operations/discover.ts";
import { prepare as prepareContext } from "../../src/context/operations/context.ts";
import { withProjectLock } from "../../src/context/storage/store.ts";
import { summarizeTidyResult } from "../../src/context/tidy/report.ts";

const usage = help();

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
      full: { type: "boolean" },
      revisit: { type: "boolean" },
      help: { type: "boolean" },
      source: { type: "string" },
      by: { type: "string" },
      key: { type: "string" },
      ref: { type: "string" },
      limit: { type: "string" },
      offset: { type: "string" },
      entity: { type: "string" },
      depth: { type: "string" },
      tree: { type: "boolean" },
      cursor: { type: "string" },
      purpose: { type: "string" },
    },
  });
  const names = tokens.filter((token) => token.kind === "option").map(({ name }) => name);
  if (new Set(names).size !== names.length) throw new Error("Options cannot be repeated");
  if (options.help) return { help: true as const, text: help(words) };
  const grouped = ["tidy", "work", "evidence", "context"].includes(words[0]);
  const command = grouped ? `${words[0]}:${words[1]}` : words[0];
  if (words.length !== (grouped ? 2 : 1)) throw new Error(usage);
  if (!Object.hasOwn(commands, command)) help(words); // Throws with available operations.
  const allowedOptions = ["cwd", "data-dir", ...commands[command].options];
  const unsupported = names.filter((name) => !allowedOptions.includes(name));
  if (unsupported.length)
    throw new Error(
      `Unsupported option for ${words.join(" ")}: ${unsupported.map((name) => `--${name}`).join(", ")}. Allowed: ${allowedOptions.map((name) => `--${name}`).join(", ")}. See ${words.join(" ")} --help.`,
    );
  if (
    command === "recall" &&
    !options.full &&
    names.some((name) => ["entity", "depth"].includes(name))
  )
    throw new Error("recall --entity and --depth require --full; use graph for focused lookup");
  if (command === "remember" || (command === "forget" && options.ref === undefined))
    parseRecordId(options.id);
  if (
    ["checkpoint", "record"].includes(command) ||
    (command.startsWith("work:") && command !== "work:result") ||
    options.work !== undefined
  )
    parseRecordId(options.work);
  if (
    options.limit !== undefined &&
    (!/^[1-9][0-9]*$/.test(options.limit) || Number(options.limit) > 200)
  ) {
    throw new Error("--limit must be an integer from 1 to 200");
  }
  const limit =
    options.limit === undefined
      ? ["search", "discover"].includes(command)
        ? 10
        : 50
      : Number(options.limit);
  if (
    options.offset !== undefined &&
    (!/^\d+$/.test(options.offset) || !Number.isSafeInteger(Number(options.offset)))
  ) {
    throw new Error("--offset must be a non-negative integer");
  }
  const offset = Number(options.offset ?? 0);
  if (options.entity !== undefined) parseRecordId(options.entity);
  if (options.entity !== undefined && options.query !== undefined)
    throw new Error("Choose --entity or --query for graph lookup");
  if (options.depth !== undefined && !/^[1-5]$/.test(options.depth))
    throw new Error("--depth must be an integer from 1 to 5");
  const depth = Number(options.depth ?? 2);
  if (["search", "discover"].includes(command) && !options.query?.trim())
    throw new Error(`${words.join(" ")} requires --query <text>`);
  if (["read", "evidence:read"].includes(command) && !options.ref)
    throw new Error(`${words.join(" ")} requires --ref <kind:id@revision>`);
  if (command.endsWith(":result") && !options.key) throw new Error("result requires --key");
  let erasureRequest: ErasureRequest | undefined;
  if (command === "forget") {
    if (options.ref !== undefined) {
      const note = parseSourceReference(options.ref);
      if (options.id !== undefined || options.revision !== undefined || note.kind !== "note") {
        throw new Error("forget --ref requires only a note reference");
      }
      erasureRequest = { note };
    } else {
      if (!/^\d+$/.test(options.revision ?? "")) throw new Error("forget requires --revision <n>");
      const revision = parseRevisionNumber(Number(options.revision));
      erasureRequest = { memoryId: options.id!, expectedRevision: revision };
    }
  }
  return {
    help: false as const,
    command,
    options: { ...options, limit, offset, depth, erasureRequest },
  };
}

async function readInputText(inputPath?: string) {
  if (inputPath !== undefined) return readFile(inputPath, "utf8");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonInput(inputPath: string | undefined): Promise<unknown> {
  if (inputPath === undefined && process.stdin.isTTY)
    throw new Error("Provide JSON via --input or stdin");
  try {
    return JSON.parse(await readInputText(inputPath));
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException;
    throw new Error(`Cannot read JSON input: ${error.message}`);
  }
}

async function runCli() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!((major === 22 && minor >= 18) || major === 24 || major >= 26)) {
    throw Object.assign(
      new Error(
        `Node.js ${process.versions.node} is unsupported. The agent should configure a supported Node.js (22.18+ in 22.x, 24.x, or 26+), verify node --version, and retry this command.`,
      ),
      { code: "LOOM_NODE_UNSUPPORTED" },
    );
  }
  const parsed = parseCommandLine();
  if (parsed.help) {
    console.log(parsed.text);
    return;
  }
  const { command, options } = parsed;
  let writeInput;
  if (
    [
      "remember",
      "checkpoint",
      "tidy:apply",
      "context:prepare",
      "evidence:append",
      "evidence:correct",
      "evidence:check",
    ].includes(command) ||
    (command.startsWith("work:") && !["work:show", "work:result"].includes(command))
  )
    writeInput = await readJsonInput(options.input);
  const location = await resolveProjectLocation({
    cwd: options.cwd,
    directory: options["data-dir"],
  });
  if (command.startsWith("work:") && command !== "work:result") {
    const result = await runWorkCommand(
      location,
      command.slice(5),
      options.work!,
      writeInput,
      options,
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  let result;
  switch (command) {
    case "work:result":
      result = await readWorkResult(location, options.key!);
      break;
    case "evidence:append":
      result = await evidence.append(location, writeInput as Parameters<typeof evidence.append>[1]);
      break;
    case "evidence:correct":
      result = await evidence.correct(
        location,
        writeInput as Parameters<typeof evidence.correct>[1],
      );
      break;
    case "evidence:read":
      result = await evidence.read(location, options.ref!);
      break;
    case "evidence:check":
      result = await checkChanges(location, writeInput as Parameters<typeof checkChanges>[1]);
      break;
    case "evidence:result":
      result = await evidence.readResult(location, options.key!);
      break;
    case "discover":
      result = await discover(location, {
        query: options.query!,
        work: options.work,
        limit: options.limit,
        cursor: options.cursor,
      });
      break;
    case "context:prepare":
      result = await prepareContext(location, writeInput);
      break;
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
        work: options.work!,
        text: await readInputText(),
        key: options.key,
        source: {
          type: (options.by ?? "agent") as RecordSource["type"],
          reference: options.source!,
        },
      });
      break;
    case "search": {
      const sourceArchive = await readSourceArchive(location);
      const matchingSources =
        options.work === undefined
          ? sourceArchive.sources
          : sourceArchive.sources.filter((source) => matchesContextScope(source, options.work));
      result = { results: rankSourcesByQuery(matchingSources, options.query!, options.limit) };
      break;
    }
    case "read":
      result = await readSource(location, options.ref!);
      break;
    case "tidy:prepare":
      result = await prepareTidyBatch(location, options);
      break;
    case "tidy:apply":
      result = await applyTidyChanges(location, writeInput);
      if (!options.full) result = summarizeTidyResult(result);
      break;
    case "tidy:status": {
      result = await readTidyStatus(location, options);
      break;
    }
    case "tidy:result":
      result = await readTidyResult(location, { key: options.key! });
      break;
    case "remember":
      result = await remember(location, options.id!, writeInput);
      break;
    case "checkpoint":
      result = await checkpoint(location, options.work!, writeInput);
      break;
    case "forget":
      result = await withProjectLock(location, () =>
        eraseContext(location, options.erasureRequest!),
      );
      break;
  }
  console.log(JSON.stringify(result, null, 2));
}

try {
  await runCli();
} catch (caught) {
  const error = caught as NodeJS.ErrnoException & { outcome?: string };
  console.error(`Loom context: ${error.code ? `[${error.code}] ` : ""}${error.message}`);
  if (error.outcome)
    console.error(
      JSON.stringify({ outcome: error.outcome, code: error.code, reason: error.message }),
    );
  process.exitCode = ["LOOM_NODE_UNSUPPORTED", "LOOM_GIT_MISSING", "LOOM_GIT_UNUSABLE"].includes(
    error.code ?? "",
  )
    ? 2
    : 1;
}
