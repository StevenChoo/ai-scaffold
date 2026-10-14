/**
 * Brings generated regions in step with the tree that is actually on disk.
 *
 * Index tables and the skill directives in `AGENTS.md` describe what a repository contains.
 * Once a developer can choose what to scaffold, shipping those regions as fixed text would
 * describe a repository nobody has. They are generated here instead, as the last step of a
 * scaffold, from the files that ended up present — including files the developer added.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { AUTOLOAD_REGION, alwaysApplyDirective } from "./autoload.js";
import { firstSentence, parseFrontmatter, readSkills } from "./catalog.js";
import { renderTable } from "./table.js";
import { detectToolchain, renderToolchain } from "./toolchain.js";

/**
 * Whether a folder entry belongs in its index.
 *
 * An index lists documents. Its own file is not a child; a dotfile is tool configuration, not
 * something to read; and a `*.local.md` file exists on one machine only, so a row for it would
 * be committed as a link nobody else can follow.
 */
export function isIndexed(name: string, isFile: boolean): boolean {
  if (name.startsWith(".")) {
    return false;
  }
  // Matched by name, not by type: a local file is as often a symlink to a sandbox's own
  // description as it is a regular file, and a link is not a file to readdir.
  if (name.endsWith(".local.md")) {
    return false;
  }
  return !(isFile && name === "_index.md");
}

/** The statuses an index row may carry. Fixed by the index template, which is human-owned. */
const STATUSES = new Set(["Current", "Draft", "Proposed", "Superseded", "Reserved"]);

/** One row of an index table. `target` is null for the placeholder row of an empty folder. */
export interface IndexRow {
  readonly label: string;
  readonly target: string | null;
  readonly status: string;
  readonly summary: string;
}

function regionPattern(region: string): RegExp {
  return new RegExp(
    `(<!-- BEGIN agent-generated:${region} -->)([\\s\\S]*?)(<!-- END agent-generated:${region} -->)`,
  );
}

/** Replaces the body of a generated region, leaving the surrounding human-owned prose alone. */
export function replaceRegion(markdown: string, region: string, body: string): string {
  const pattern = regionPattern(region);
  if (!pattern.test(markdown)) {
    return markdown;
  }
  return markdown.replace(pattern, (_match, open: string, _old: string, close: string) => {
    return `${open}\n\n${body}\n\n${close}`;
  });
}

/** Reads the body of a generated region, or undefined when the region is absent. */
export function readRegion(markdown: string, region: string): string | undefined {
  const match = regionPattern(region).exec(markdown);
  return match?.[2]?.trim();
}

/** Parses the rows of an index table so existing statuses and summaries can be preserved. */
export function parseIndexTable(markdown: string): IndexRow[] {
  const body = readRegion(markdown, "index-table");
  if (body === undefined) {
    return [];
  }

  const rows: IndexRow[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }
    const cells = trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined).split("|").map((cell) => cell.trim());
    if (cells.length < 3) {
      continue;
    }
    const [first, status, summary] = cells as [string, string, string];
    if (/^-+$/.test(first) || first === "File") {
      continue;
    }
    const link = /\[([^\]]*)\]\(([^)]*)\)/.exec(first);
    rows.push({
      // Labels are stored bare; the code fence is part of rendering, not of the name.
      label: (link?.[1] ?? first).replace(/^`|`$/g, ""),
      target: link?.[2] ?? null,
      status: STATUSES.has(status) ? status : "Current",
      summary,
    });
  }
  return rows;
}

/** Renders rows as a padded Markdown table, matching the shape the templates already use. */
export function renderIndexTable(rows: readonly IndexRow[]): string {
  const cells = rows.map((row) => [
    row.target === null ? row.label : `[\`${row.label}\`](${row.target})`,
    row.status,
    row.summary,
  ]);
  return renderTable(["File", "Status", "Summary"], cells);
}

/** The first path segment of a row's link, which is the direct child the row stands for. */
function rowChild(row: IndexRow): string | undefined {
  if (row.target === null) {
    return undefined;
  }
  const [head] = row.target.split("/");
  return head === undefined || head.length === 0 ? undefined : head;
}

/** A one-line summary for a file no index has described yet. */
async function deriveSummary(path: string, isDirectory: boolean): Promise<string> {
  const file = isDirectory ? join(path, "SKILL.md") : path;
  if (!existsSync(file)) {
    return "<placeholder>One-line purpose.</placeholder>";
  }

  const content = await readFile(file, "utf8");
  const description = parseFrontmatter(content)["description"];
  if (typeof description === "string" && description.length > 0) {
    return firstSentence(description);
  }

  // A sentence wrapped to the prose width runs over several lines, so a summary is taken
  // from a whole paragraph rather than from its first line.
  const purpose = /^\*\*Purpose\.\*\*\s*(.+(?:\r?\n[ \t]*\S.*)*)/m.exec(content);
  if (purpose?.[1]) {
    return firstSentence(purpose[1]);
  }

  const body = content.replace(/^---[\s\S]*?---\r?\n/, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const paragraph of body.split(/\r?\n[ \t]*\r?\n/)) {
    // A heading or a note is not a summary, even when prose follows it directly.
    const prose = paragraph
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("#") && !line.startsWith(">"))
      .join(" ")
      .trim();
    if (prose.length > 0) {
      return firstSentence(prose);
    }
  }
  return "<placeholder>One-line purpose.</placeholder>";
}

/** The link a child is reached through: an index for a folder, a `SKILL.md` for a skill. */
function childTarget(directory: string, name: string, isDirectory: boolean): string | undefined {
  if (!isDirectory) {
    return name;
  }
  if (existsSync(join(directory, name, "_index.md"))) {
    return `${name}/_index.md`;
  }
  if (existsSync(join(directory, name, "SKILL.md"))) {
    return `${name}/SKILL.md`;
  }
  return undefined;
}

/**
 * Rewrites one folder's index table from its contents.
 *
 * A row already present wins, so a summary a human wrote is never replaced by a generated
 * one. The shipped template supplies rows for files this scaffold wrote but the target has
 * not described yet, and anything still unaccounted for is derived from the file itself.
 */
async function reindexFolder(directory: string, templateDirectory: string | undefined): Promise<boolean> {
  const indexPath = join(directory, "_index.md");
  if (!existsSync(indexPath)) {
    return false;
  }

  const original = await readFile(indexPath, "utf8");
  if (readRegion(original, "index-table") === undefined) {
    return false;
  }

  const existingRows = parseIndexTable(original);
  const templateIndex =
    templateDirectory && existsSync(join(templateDirectory, "_index.md"))
      ? await readFile(join(templateDirectory, "_index.md"), "utf8")
      : undefined;
  const templateRows = templateIndex ? parseIndexTable(templateIndex) : [];

  const byChild = (rows: readonly IndexRow[]): Map<string, IndexRow> => {
    const map = new Map<string, IndexRow>();
    for (const row of rows) {
      const child = rowChild(row);
      if (child !== undefined && !map.has(child)) {
        map.set(child, row);
      }
    }
    return map;
  };
  const existingByChild = byChild(existingRows);
  const templateByChild = byChild(templateRows);

  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => isIndexed(entry.name, entry.isFile()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows: IndexRow[] = [];
  for (const entry of entries) {
    const isDirectory = entry.isDirectory();
    const target = childTarget(directory, entry.name, isDirectory);
    if (target === undefined) {
      continue;
    }

    const known = existingByChild.get(entry.name) ?? templateByChild.get(entry.name);
    rows.push({
      label: isDirectory ? `${entry.name}/` : entry.name,
      target,
      status: known?.status ?? "Current",
      summary: known?.summary ?? (await deriveSummary(join(directory, entry.name), isDirectory)),
    });
  }

  if (rows.length === 0) {
    // An empty folder is still a deliberate placeholder; keep whatever note explains it.
    const placeholder =
      existingRows.find((row) => row.target === null) ?? templateRows.find((row) => row.target === null);
    rows.push(
      placeholder ?? {
        label: "—",
        target: null,
        status: "Reserved",
        summary: "Nothing here yet.",
      },
    );
  }

  const updated = replaceRegion(original, "index-table", renderIndexTable(rows));
  if (updated === original) {
    return false;
  }
  await writeFile(indexPath, updated);
  return true;
}

/**
 * Rewrites the `skill-directives` region of `AGENTS.md` from the skills actually installed.
 *
 * A skill announces itself with an `agents-md` frontmatter sentence containing `{skill}`.
 * A skill without one contributes nothing, so not every skill has to reach the guide.
 */
async function reindexAgentsMd(
  target: string,
  folderName: string,
  autoload: readonly string[],
): Promise<boolean> {
  const agentsPath = join(target, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    return false;
  }

  const original = await readFile(agentsPath, "utf8");
  const skillsRoot = join(target, folderName, "skills");
  const hasSkillsFolder = existsSync(skillsRoot);
  const skills = hasSkillsFolder ? await readSkills(skillsRoot) : [];

  const directives = skills
    .filter((skill) => skill.agentsDirective !== undefined && skill.agentsDirective.length > 0)
    .map((skill) => {
      const path = `${folderName}/skills/${skill.name}/SKILL.md`;
      return (skill.agentsDirective ?? "").replace("{skill}", `[\`${path}\`](${path})`);
    });

  let updated = replaceRegion(
    original,
    "skill-directives",
    directives.length > 0
      ? directives.join("\n\n")
      : "<!-- No installed skill announces itself here. -->",
  );

  // The bullet points at the skills folder, so it may only stand while that folder exists.
  updated = replaceRegion(
    updated,
    "optional-skills",
    hasSkillsFolder
      ? `- Apply relevant installed skills from [\`${folderName}/skills/\`](${folderName}/skills/_index.md). Skills add task-specific workflow guidance and do not override repository rules or\n  developer instructions.`
      : "<!-- No skills folder was scaffolded. -->",
  );

  // Which skills apply unasked is a developer's answer, not a property of the tree, so it is
  // passed in rather than derived from what is installed.
  updated = replaceRegion(updated, AUTOLOAD_REGION, alwaysApplyDirective(folderName, autoload));

  if (updated === original) {
    return false;
  }
  await writeFile(agentsPath, updated);
  return true;
}

export interface ReindexOptions {
  readonly target: string;
  readonly folderName: string;
  /** The shipped `templates/.ai` directory, consulted for rows the target has not written. */
  readonly templateAiRoot: string;
  /** Skills the developer chose to load in every session. */
  readonly autoload?: readonly string[];
}

/**
 * Regenerates every generated region under the AI folder and in `AGENTS.md`.
 *
 * Returns the repository-relative paths that changed, so a caller can report them.
 */
export async function reindexScaffold(options: ReindexOptions): Promise<string[]> {
  const changed: string[] = [];
  const aiRoot = join(options.target, options.folderName);

  async function visit(directory: string, templateDirectory: string | undefined, relative: string): Promise<void> {
    if (!existsSync(directory)) {
      return;
    }

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      // A dot-folder is not part of the tree, like a dotfile; a backup inside it must stay as it was.
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      await visit(
        join(directory, entry.name),
        templateDirectory ? join(templateDirectory, entry.name) : undefined,
        relative ? `${relative}/${entry.name}` : entry.name,
      );
    }

    if (await reindexFolder(directory, templateDirectory)) {
      changed.push(`${relative}/_index.md`);
    }
  }

  await visit(aiRoot, options.templateAiRoot, options.folderName);

  // The toolchain region is regenerated like an index table, so a changed lockfile or script
  // reaches the environment context on the next run instead of going stale in it.
  const environmentPath = join(aiRoot, "context", "environment.md");
  if (existsSync(environmentPath)) {
    const current = await readFile(environmentPath, "utf8");
    const updated = replaceRegion(current, "toolchain", renderToolchain(await detectToolchain(options.target)));
    if (updated !== current) {
      await writeFile(environmentPath, updated, "utf8");
      changed.push(`${options.folderName}/context/environment.md`);
    }
  }

  if (await reindexAgentsMd(options.target, options.folderName, options.autoload ?? [])) {
    changed.push("AGENTS.md");
  }

  return changed.sort((a, b) => a.localeCompare(b));
}
