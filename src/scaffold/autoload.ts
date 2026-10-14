/**
 * Skills a session loads whether or not a task matches them.
 *
 * A skill is normally read when the work calls for it. Some are about how to answer at all —
 * how plainly to write, how much to say — and those are useless if they arrive after the
 * answer. The developer names them, and they are written into the two files a harness reads
 * before anything else.
 *
 * Two mechanisms, because no single one is portable. `CLAUDE.md` imports a path with
 * `@path/to/file`, and Claude Code expands it into the session at launch, which is the only
 * mechanism here that actually guarantees loading. Every other harness gets a sentence in
 * `AGENTS.md` naming the same skills, which is a pointer and therefore advisory. Neither
 * writes a harness setting, and neither adds a file to the three the scaffold may write.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The generated region carrying the imports, in `CLAUDE.md` and in `AGENTS.md` alike. */
export const AUTOLOAD_REGION = "autoload-skills";

/** The line a `CLAUDE.md` starts with, which is what makes `AGENTS.md` reach a session at all. */
const CLAUDE_MD_ENTRY = "@AGENTS.md";

/** The import line for one skill, resolved relative to the repository root. */
function importLine(folderName: string, skill: string): string {
  return `@${folderName}/skills/${skill}/SKILL.md`;
}

/**
 * The body of the generated region in `CLAUDE.md`: one import per skill, or a note saying
 * why the region is empty, so a reader does not take the markers for a bug.
 */
export function claudeImports(folderName: string, autoload: readonly string[]): string {
  if (autoload.length === 0) {
    return "<!-- No skill is loaded in every session. -->";
  }
  return autoload.map((skill) => importLine(folderName, skill)).join("\n");
}

/** The body of the matching region in `AGENTS.md`, for a harness that expands no imports. */
export function alwaysApplyDirective(folderName: string, autoload: readonly string[]): string {
  if (autoload.length === 0) {
    return "<!-- No skill is applied in every session. -->";
  }
  const links = autoload.map((skill) => {
    const path = `${folderName}/skills/${skill}/SKILL.md`;
    return `[\`${path}\`](${path})`;
  });
  const list =
    links.length === 1
      ? (links[0] as string)
      : `${links.slice(0, -1).join(", ")} and ${links[links.length - 1] as string}`;
  const pronoun = links.length === 1 ? "it" : "them";
  return `Apply ${list} in every session, including when no task obviously matches. Read ${pronoun} now, before answering.`;
}

/**
 * A whole `CLAUDE.md`: the entry import, plus a generated region when something autoloads.
 *
 * With nothing to load the region is left out entirely rather than written empty, because a
 * file of markers around a comment is noise in the one file a harness reads first.
 */
export function renderClaudeMd(folderName: string, autoload: readonly string[]): string {
  if (autoload.length === 0) {
    return `${CLAUDE_MD_ENTRY}\n`;
  }
  return [
    CLAUDE_MD_ENTRY,
    "",
    `<!-- BEGIN agent-generated:${AUTOLOAD_REGION} -->`,
    "",
    claudeImports(folderName, autoload),
    "",
    `<!-- END agent-generated:${AUTOLOAD_REGION} -->`,
    "",
  ].join("\n");
}

/**
 * Updates an existing `CLAUDE.md` in place, touching only the generated region.
 *
 * A file the developer has written around is theirs; a file that never had the region gets
 * one appended rather than being replaced.
 */
export function withAutoloadRegion(
  existing: string,
  folderName: string,
  autoload: readonly string[],
): string {
  const pattern = new RegExp(
    `(<!-- BEGIN agent-generated:${AUTOLOAD_REGION} -->)([\\s\\S]*?)(<!-- END agent-generated:${AUTOLOAD_REGION} -->)`,
  );
  const body = claudeImports(folderName, autoload);
  if (pattern.test(existing)) {
    return existing.replace(pattern, (_match, open: string, _old: string, close: string) => {
      return `${open}\n\n${body}\n\n${close}`;
    });
  }
  // Nothing to load and no region yet: the one-line pointer stays one line, as a fresh file would.
  if (autoload.length === 0) {
    return existing;
  }
  const separator = existing.endsWith("\n") ? "" : "\n";
  return `${existing}${separator}\n<!-- BEGIN agent-generated:${AUTOLOAD_REGION} -->\n\n${body}\n\n<!-- END agent-generated:${AUTOLOAD_REGION} -->\n`;
}

/** Whether an existing `CLAUDE.md` is one this tool wrote, and may therefore update in place. */
export function isScaffoldClaudeMd(content: string): boolean {
  return content.includes(CLAUDE_MD_ENTRY) || content.includes(`agent-generated:${AUTOLOAD_REGION}`);
}

/**
 * The skills an existing install already loads every session.
 *
 * Read back so a re-run defaults to what is there rather than silently emptying it, the same
 * way the folder and skill selections do.
 */
export async function readAutoload(target: string, folderName: string): Promise<string[]> {
  const claudePath = join(target, "CLAUDE.md");
  if (!existsSync(claudePath)) {
    return [];
  }
  const content = await readFile(claudePath, "utf8");
  const prefix = `@${folderName}/skills/`;
  const names: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix) && trimmed.endsWith("/SKILL.md")) {
      names.push(trimmed.slice(prefix.length, -"/SKILL.md".length));
    }
  }
  return names;
}

/**
 * What autoloading these skills adds to every session, in words of their `SKILL.md` files.
 *
 * Roots are tried in order, because a skill is either ours or someone else's and the two are
 * shipped from different trees.
 */
export async function autoloadCost(
  skillsRoots: readonly string[],
  autoload: readonly string[],
): Promise<number> {
  let words = 0;
  for (const skill of autoload) {
    const file = skillsRoots
      .map((root) => join(root, skill, "SKILL.md"))
      .find((candidate) => existsSync(candidate));
    if (file === undefined) {
      continue;
    }
    const content = await readFile(file, "utf8");
    words += content.split(/\s+/).filter((word) => word.length > 0).length;
  }
  return words;
}
