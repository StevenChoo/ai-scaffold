/**
 * What the shipped template payload contains, discovered rather than hard-coded.
 *
 * Adding a skill or a folder to `templates/.ai/` must be enough to make it selectable, so
 * nothing here may carry a list that a new directory would have to be added to by hand.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

/** A skill directory shipped with the scaffold, described by its own `SKILL.md`. */
export interface SkillEntry {
  /** Directory name, which is also the skill's name. */
  readonly name: string;
  /** The `description` frontmatter field, used to explain the choice to a developer. */
  readonly description: string;
  /**
   * The `agents-md` frontmatter field: a sentence for `AGENTS.md` telling an agent when to
   * read this skill, with `{skill}` standing in for a link to it. Absent when the skill does
   * not need to be announced at the top of the guide.
   */
  readonly agentsDirective: string | undefined;
  /**
   * The yes/no choices this skill offers, listed under `options` in its frontmatter. Guarded
   * prose inside the skill reads each as `option:<name>`. Every answer defaults to no, so a
   * choice whose natural default is yes is named for the departure from it.
   */
  readonly options: readonly SkillOption[];
  /**
   * A folder this skill only makes sense with, named by `requires-folder`. The skill is left
   * out of the default selection when that folder is not scaffolded, since a skill about a
   * folder nobody has is noise.
   */
  readonly requiresFolder: string | undefined;
}

/** A yes/no choice a skill offers when it is installed. */
export interface SkillOption {
  readonly name: string;
  readonly prompt: string;
}

/**
 * Reads the leading `---` block of a Markdown file.
 *
 * A skill this repository did not write is not ours to reject, so frontmatter that does not
 * parse yields no fields rather than an error: the skill is still installed, it simply
 * announces nothing.
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match?.[1]) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch {
    return {};
  }

  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

/** A frontmatter field as text, since YAML may hand back a number, a map, or nothing at all. */
function asText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  return typeof value === "number" ? String(value) : undefined;
}

/** The choices a skill declares, ignoring an entry that does not name both halves. */
function readOptions(value: unknown): SkillOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const options: SkillOption[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const name = asText((entry as Record<string, unknown>)["name"]);
    const prompt = asText((entry as Record<string, unknown>)["prompt"]);
    if (name && prompt) {
      options.push({ name, prompt });
    }
  }
  return options;
}

/** Collapses a description to the single sentence an index table can hold. */
export function firstSentence(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const end = /[.!?](?:\s|$)/.exec(collapsed);
  if (!end) {
    return collapsed;
  }
  return collapsed.slice(0, end.index + 1);
}

/**
 * Frontmatter fields that configure the scaffolder rather than instruct an agent.
 *
 * They are removed on the way out: once a choice has been resolved into the prose, leaving
 * the question in the file would read as though it were still open.
 */
export const SCAFFOLDER_FIELDS = ["options", "requires-folder"] as const;

/** Removes the named fields from a document's leading frontmatter block, if it has one. */
export function removeFrontmatterFields(content: string, fields: readonly string[]): string {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(content);
  if (!match?.[2]) {
    return content;
  }

  const remove = new Set(fields);
  const kept: string[] = [];
  let dropping = false;
  for (const line of match[2].split(/\r?\n/)) {
    const keyed = /^([A-Za-z][\w-]*):/.exec(line);
    if (keyed?.[1] !== undefined) {
      dropping = remove.has(keyed[1]);
    } else if (dropping && !/^\s+\S/.test(line)) {
      dropping = false;
    }
    if (!dropping) {
      kept.push(line);
    }
  }

  return `${match[1]}${kept.join("\n")}${match[3]}${content.slice(match[0].length)}`;
}

async function directoryNames(root: string): Promise<string[]> {
  if (!existsSync(root)) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Folders offered but not selected by default.
 *
 * Adding a folder to the payload still needs no edit here: a new directory is offered and
 * selected like every other one. A folder only appears below when it is useless until a
 * developer fills it, which is a property of that folder rather than of the payload.
 */
export const OPT_IN_FOLDERS: ReadonlySet<string> = new Set(["commands", "environments", "handoffs", "research", "specs"]);

/**
 * What each folder holds, with an example, for the folder menu.
 *
 * A folder name alone does not say whether it is worth choosing, least of all for the opt-in
 * ones. A folder added to the payload without a hint is still offered, only without one.
 */
export const FOLDER_HINTS: Readonly<Record<string, string>> = {
  commands: "how commands must be invoked, e.g. `pnpm test`, never `npm test`",
  context: "durable project facts, e.g. what it is, where it runs, what surrounds it",
  environments: "one profile per machine setup, e.g. macos-sandbox.md: no gpg, push over HTTPS",
  handoffs: "where a session stopped, e.g. feature--login.md: next step, open questions",
  prompts: "reusable task prompts, e.g. a release checklist to run again",
  research: "dated surveys before a decision, e.g. comparing three auth libraries",
  skills: "workflow guidance loaded when a task matches, e.g. how to commit",
  specs: "what the project must do, one capability per file, e.g. backend/auth/login.md",
  templates: "human-owned templates for context, skills, prompts and indexes",
};

/** The selectable folders directly under the AI folder, in the order they are offered. */
export async function readTemplateFolders(templateAiRoot: string): Promise<string[]> {
  return await directoryNames(templateAiRoot);
}

/** Reads one skill directory, from either the template payload or a scaffolded repository. */
export async function readSkill(skillsRoot: string, name: string): Promise<SkillEntry | undefined> {
  const skillFile = join(skillsRoot, name, "SKILL.md");
  if (!existsSync(skillFile)) {
    return undefined;
  }
  const frontmatter = parseFrontmatter(await readFile(skillFile, "utf8"));
  return {
    name,
    description: asText(frontmatter["description"]) ?? "",
    agentsDirective: asText(frontmatter["agents-md"]),
    options: readOptions(frontmatter["options"]),
    requiresFolder: asText(frontmatter["requires-folder"]),
  };
}

/** The skills available in a skills directory, ignoring anything without a `SKILL.md`. */
export async function readSkills(skillsRoot: string): Promise<SkillEntry[]> {
  const names = await directoryNames(skillsRoot);
  const skills: SkillEntry[] = [];
  for (const name of names) {
    const skill = await readSkill(skillsRoot, name);
    if (skill) {
      skills.push(skill);
    }
  }
  return skills;
}
