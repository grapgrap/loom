import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  checkpoint, forget, parseCheckpointInput, parseCheckpointRecord, parseMemoryInput,
  parseMemoryRecord, present, recordId, remember, revisionNumber,
} from "./context-records.mjs";
import { directoryEntries, mutateRecord, projectLocation, readRecord } from "./context-store.mjs";

const usage = `Usage: node <plugin>/scripts/context.mjs <command> [options]

Commands:
  location    Show the resolved project and storage paths without creating files.
  recall      Read current project memories and work summaries.
  remember    Create or revise a memory: --id <id>, JSON input.
  checkpoint  Save verified progress: --work <id>, JSON input.
  forget      Erase a memory and its history: --id <id> --revision <n>.

Options:
  --cwd <path>       Git checkout or worktree (default: current directory).
  --data-dir <path>  Absolute storage override (otherwise LOOM_DATA_DIR or OS default).
  --work <id>        Include this work's scoped memories and full checkpoint in recall.
  --query <text>     Filter recalled memories by words in current text and reason.
  --history         Include prior revisions in recall; current revisions are the default.
  --input <path>    Read write-command JSON from a file instead of stdin.
  --help            Show usage.

Requires Node.js 20+ and Git. Use context.sh (macOS/Linux) or context.cmd (Windows) to diagnose missing Node.
Exit code 2 requests dependency setup by the agent; other failures use exit code 1.
Write inputs require expectedRevision (0 for a new record).
See skills/work/references/context.md for schemas and recording policy.`;

function commandLine() {
  const { values, positionals, tokens } = parseArgs({ allowPositionals: true, tokens: true,
    options: {
      cwd: { type: "string" }, "data-dir": { type: "string" }, id: { type: "string" },
      work: { type: "string" }, revision: { type: "string" }, query: { type: "string" },
      input: { type: "string" }, history: { type: "boolean" }, help: { type: "boolean" },
    } });
  const names = tokens.filter(({ kind }) => kind === "option").map(({ name }) => name);
  if (new Set(names).size !== names.length) throw new Error("Options cannot be repeated");
  if (values.help) return { help: true };
  if (positionals.length !== 1) throw new Error(usage);
  const command = positionals[0];
  const optionsByCommand = {
    location: [], recall: ["work", "query", "history"], remember: ["id", "input"],
    checkpoint: ["work", "input"], forget: ["id", "revision"],
  };
  if (!Object.hasOwn(optionsByCommand, command)) throw new Error(`Unknown command: ${command}\n${usage}`);
  const allowed = ["cwd", "data-dir", ...optionsByCommand[command]];
  if (names.some((name) => !allowed.includes(name))) throw new Error(`Unsupported option for ${command}`);
  if (["remember", "forget"].includes(command)) recordId(values.id);
  if (command === "checkpoint" || values.work !== undefined) recordId(values.work);
  if (command === "forget") {
    if (!/^\d+$/.test(values.revision ?? "")) throw new Error("forget requires --revision <n>");
    values.revision = revisionNumber(Number(values.revision));
  }
  return { command, values };
}

function inputJson(path) {
  if (path === undefined && process.stdin.isTTY) throw new Error("Provide JSON via --input or stdin");
  try {
    return JSON.parse(readFileSync(path ?? 0, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON input: ${error.message}`);
  }
}

function memoryPath(location, id) {
  return join(location.projectDirectory, "context", `${recordId(id)}.json`);
}

function checkpointPath(location, id) {
  return join(location.projectDirectory, "works", recordId(id), "checkpoint.json");
}

function validatorFor(id, validate) {
  return (value) => {
    const record = validate(value);
    if (record.id !== id) throw new Error(`Record ID does not match its file: expected ${id}`);
    return record;
  };
}

async function readMemories(location) {
  const entries = await directoryEntries(join(location.projectDirectory, "context"));
  const records = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const id = recordId(entry.name.slice(0, -5));
    const record = await readRecord(memoryPath(location, id), validatorFor(id, parseMemoryRecord));
    if (record && !record.forgotten) records.push(record);
  }
  return records;
}

async function readWorks(location) {
  const entries = await directoryEntries(join(location.projectDirectory, "works"));
  const works = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = recordId(entry.name);
    const record = await readRecord(checkpointPath(location, id), validatorFor(id, parseCheckpointRecord));
    if (record) works.push(record);
  }
  return works.sort((a, b) => b.revisions.at(-1).recordedAt.localeCompare(a.revisions.at(-1).recordedAt) ||
    a.id.localeCompare(b.id));
}

async function recall(location, options) {
  const [records, checkpoints] = await Promise.all([readMemories(location), readWorks(location)]);
  const words = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const memories = records.filter(({ scope }) => scope.type === "project" || scope.id === options.work)
    .map((record) => present(record, options.history))
    .filter(({ text, reason }) => words.every((word) => `${text}\n${reason}`.toLowerCase().includes(word)));
  const works = checkpoints.map((record) => {
    const { id, revision, recordedAt, goal, status } = present(record);
    return { id, revision, recordedAt, goal, status };
  });
  const selected = checkpoints.find(({ id }) => id === options.work) ?? null;
  return { ...location, memories, works, work: present(selected, options.history) };
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 20) {
    throw Object.assign(new Error(`Node.js ${process.versions.node} is unsupported. The agent should configure a supported Node.js LTS (20+), verify node --version, and retry this command.`),
    { code: "LOOM_NODE_UNSUPPORTED" });
  }
  const parsed = commandLine();
  if (parsed.help) { console.log(usage); return; }
  const { command, values } = parsed;
  let submission;
  if (command === "remember") submission = parseMemoryInput(inputJson(values.input));
  if (command === "checkpoint") submission = parseCheckpointInput(inputJson(values.input));
  const location = await projectLocation({ cwd: values.cwd, directory: values["data-dir"] });
  let result;
  switch (command) {
    case "location": result = location; break;
    case "recall": result = await recall(location, values); break;
    case "remember":
      result = present(await mutateRecord({ path: memoryPath(location, values.id),
        validate: validatorFor(values.id, parseMemoryRecord),
        update: (existing) => remember(existing, values.id, submission) }));
      break;
    case "checkpoint":
      result = present(await mutateRecord({ path: checkpointPath(location, values.work),
        validate: validatorFor(values.work, parseCheckpointRecord),
        update: (existing) => checkpoint(existing, values.work, submission) }));
      break;
    case "forget":
      result = present(await mutateRecord({ path: memoryPath(location, values.id),
        validate: validatorFor(values.id, parseMemoryRecord),
        update: (existing) => forget(existing, values.revision) }));
      break;
  }
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(`Loom context: ${error.code ? `[${error.code}] ` : ""}${error.message}`);
  process.exitCode = ["LOOM_NODE_UNSUPPORTED", "LOOM_GIT_MISSING", "LOOM_GIT_UNUSABLE"]
    .includes(error.code) ? 2 : 1;
}
