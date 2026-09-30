import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  check(isRecord(value), `${path}: expected a JSON object`);
  return value;
}

function localPath(root, base, target) {
  const path = resolve(base, target);
  const location = relative(root, path);
  check(
    location !== ".." && !location.startsWith(`..${sep}`) && !isAbsolute(location),
    `${base}: path leaves the plugin: ${target}`,
  );
  check(existsSync(path), `${base}: missing local target: ${target}`);
  return path;
}

function checkSkill(path) {
  const text = readFileSync(path, "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  check(frontmatter, `${path}: missing YAML frontmatter`);
  const document = parseDocument(frontmatter[1]);
  const issue = document.errors[0] ?? document.warnings[0];
  check(!issue, `${path}: ${issue?.message}`);
  const metadata = document.toJS({ maxAliasCount: 0 });
  check(isRecord(metadata), `${path}: expected a YAML mapping`);

  const allowed = new Set(["name", "description", "license", "allowed-tools", "metadata"]);
  check(
    Object.keys(metadata).every((key) => allowed.has(key)),
    `${path}: unsupported frontmatter fields`,
  );
  const { name, description } = metadata;
  check(
    typeof name === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64,
    `${path}: invalid skill name`,
  );
  check(name === basename(dirname(path)), `${path}: name does not match its directory`);
  check(
    typeof description === "string" && description.trim().length > 0 &&
      [...description].length <= 1024 && !/[<>]/.test(description),
    `${path}: invalid description`,
  );
}

function headingAnchors(text) {
  return [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) =>
    heading.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, "").replaceAll(" ", "-"),
  );
}

function checkLinks(root, path) {
  const text = readFileSync(path, "utf8");
  for (const [, link] of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue;

    const separator = link.indexOf("#");
    const target = separator < 0 ? link : link.slice(0, separator);
    const anchor = separator < 0 ? undefined : link.slice(separator + 1);
    const destination = target === "" ? path : localPath(root, dirname(path), target);
    if (anchor === undefined || extname(destination) !== ".md") continue;

    check(
      headingAnchors(readFileSync(destination, "utf8")).includes(anchor),
      `${path}: missing heading: ${link}`,
    );
  }
}

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

function checkPlugin(root) {
  const codex = readJson(join(root, ".codex-plugin/plugin.json"));
  const claude = readJson(join(root, ".claude-plugin/plugin.json"));
  const marketplace = readJson(join(root, ".agents/plugins/marketplace.json"));
  for (const field of ["name", "version", "description"]) {
    check(typeof codex[field] === "string" && codex[field].length > 0, `Codex manifest: missing ${field}`);
    check(codex[field] === claude[field], `Plugin manifests disagree on ${field}`);
  }
  const { plugins } = marketplace;
  check(
    Array.isArray(plugins) && plugins.every(isRecord),
    "Marketplace plugins must be an array of objects",
  );
  const entry = plugins.find((plugin) => plugin.name === codex.name);
  check(entry, "Marketplace does not contain this plugin");
  check(entry.description === codex.description, "Marketplace description differs from the plugin");
  check(typeof entry.source === "string", "Marketplace source must be a local path");
  check(localPath(root, root, entry.source) === root, "Marketplace source must point to this plugin");
  check(typeof codex.skills === "string", "Codex manifest: missing skills path");
  const skillsDirectory = localPath(root, root, codex.skills);
  const skills = readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDirectory, entry.name, "SKILL.md"))
    .filter(existsSync)
    .sort();
  check(skills.length > 0, "No skills found");
  for (const path of skills) checkSkill(path);

  const readmes = readdirSync(root)
    .filter((name) => /^README.*\.md$/.test(name))
    .map((name) => join(root, name));
  const markdown = [
    ...markdownFiles(skillsDirectory),
    ...markdownFiles(join(root, "references")),
    ...markdownFiles(join(root, "templates")),
    ...readmes,
  ].sort();
  for (const path of markdown) checkLinks(root, path);
  console.log(`PASS: ${skills.length} skills, 3 manifests, ${markdown.length} Markdown files and local links`);
}

try {
  const args = process.argv.slice(2);
  check(args.length <= 1, "Usage: node scripts/check-plugin.mjs [plugin-directory]");
  const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
  checkPlugin(resolve(args[0] ?? defaultRoot));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
