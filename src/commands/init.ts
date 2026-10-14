/**
 * `ai-scaffold init` — copy the scaffold payload into a target repository.
 *
 * Provides an interactive menu using @clack/prompts when running in a TTY,
 * with CLI flags available for non-interactive or customized execution.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { cancel, confirm, intro, isCancel, log, multiline, multiselect, outro, select, text } from "@clack/prompts";
import {
  FOLDER_HINTS,
  OPT_IN_FOLDERS,
  SCAFFOLDER_FIELDS,
  firstSentence,
  readSkills,
  readTemplateFolders,
  removeFrontmatterFields,
} from "../scaffold/catalog.js";
import {
  BACKUP_FOLDER,
  MIGRATE_INSTRUCTIONS,
  backupScaffold,
  readRecordedVersion,
  renderMigrateInstructions,
} from "../scaffold/backup.js";
import { changedFiles } from "../scaffold/prune.js";
import { reindexScaffold } from "../scaffold/reindex.js";
import {
  autoloadCost,
  isScaffoldClaudeMd,
  readAutoload,
  renderClaudeMd,
  withAutoloadRegion,
} from "../scaffold/autoload.js";
import { applyRequirements, conditionsFor } from "../scaffold/requirements.js";
import {
  DEFAULT_WRAP,
  FORMATTER_SKILL,
  REFLOW_OPTION,
  applyWrapWidth,
  formatterConfigFor,
  parseWrapSetting,
  reflows,
} from "../scaffold/wrap.js";
import type { AdvancedChoice } from "../scaffold/advanced.js";
import {
  NO_CUSTOMISATION,
  advancedChoicesFor,
  collectAnswers,
  hasAdvancedChoices,
} from "../scaffold/advanced.js";
import type { Provider } from "../providers/manifest.js";
import { providersOfKind, readManifest } from "../providers/manifest.js";
import {
  missingBinaries,
  providerTemplatesRoot,
  readLocalProviderSkill,
  readVendoredSkills,
  vendorSkillsRoot,
} from "../providers/install.js";
import { ExitCode, UsageError } from "../result.js";
import { locateConfig, readConfig, withConfig } from "./config.js";

/**
 * What to do when the target already carries agent tooling.
 *
 * `update` fills in what is missing and leaves every existing file untouched.
 * `fresh` replaces each file the scaffold owns with the shipped version. Neither
 * mode deletes a file the scaffold does not ship.
 */
export type ScaffoldMode = "update" | "fresh";

export interface InitOptions {
  /** Absolute path of the repository to scaffold. Defaults to current directory. */
  readonly target: string;
  /** Name of the AI tool folder. Defaults to ".ai". */
  readonly folderName?: string | undefined;
  /** Initial description of what the project is about. */
  readonly projectAbout?: string | undefined;
  /** Whether to update .gitignore to exclude the AI folder. */
  readonly updateGitignore?: boolean | undefined;
  /** Whether to record the ai-scaffold version in the AI folder. */
  readonly trackVersion?: boolean | undefined;
  /** Whether to create CLAUDE.md referencing @AGENTS.md. */
  readonly createClaudeMd?: boolean | undefined;
  /** How to treat a target that already has agent tooling. Undefined means ask. */
  readonly mode?: ScaffoldMode | undefined;
  /** Whether a fresh scaffold first copies the setup it replaces into the AI folder. */
  readonly backup?: boolean | undefined;
  /** Whether that backup carries migration instructions for an agent. */
  readonly migrateInstructions?: boolean | undefined;
  /** Folders under the AI folder to scaffold. Undefined means ask, then default to all. */
  readonly folders?: readonly string[] | undefined;
  /** Skills to scaffold. Undefined means ask, then default to all. */
  readonly skills?: readonly string[] | undefined;
  /** Installed skills that load in every session, through CLAUDE.md imports and AGENTS.md. */
  readonly autoload?: readonly string[] | undefined;
  /** Options to enable, named by the skills that declare them. Unnamed options stay off. */
  readonly options?: readonly string[] | undefined;
  /** External tools to install, by name. Undefined means ask, then default to none. */
  readonly tools?: readonly string[] | undefined;
  /** Bundled extras to install, by name. Undefined means ask, then default to none. */
  readonly extras?: readonly string[] | undefined;
  /** Config file answering these questions ahead of time. Undefined means look for one. */
  readonly configPath?: string | undefined;
  /** Markdown prose width in columns, or "no-reflow". Undefined means the default width. */
  readonly wrap?: string | undefined;
  /** Project constraints for the environment context file. Undefined leaves its placeholder. */
  readonly environment?: string | undefined;
  /** Replace files that already exist. */
  readonly force: boolean;
  /** Report the plan without writing anything. */
  readonly dryRun: boolean;
  /** Skip interactive prompts and use defaults for unprovided options. */
  readonly yes: boolean;
}

/** Reads a comma-separated selection, where "none" and "" both mean an empty selection. */
function parseNameList(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "none") {
    return [];
  }
  return trimmed
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/** Parses `init` arguments, rejecting anything ambiguous rather than guessing. */
export function parseInitArguments(argv: readonly string[]): InitOptions {
  let target: string | undefined;
  let folderName: string | undefined;
  let projectAbout: string | undefined;
  let updateGitignore: boolean | undefined;
  let trackVersion: boolean | undefined;
  let createClaudeMd: boolean | undefined;
  let mode: ScaffoldMode | undefined;
  let backup: boolean | undefined;
  let migrateInstructions: boolean | undefined;
  let folders: string[] | undefined;
  let skills: string[] | undefined;
  let autoload: string[] | undefined;
  let chosenOptions: string[] | undefined;
  let tools: string[] | undefined;
  let extras: string[] | undefined;
  let configPath: string | undefined;
  let wrap: string | undefined;
  let environment: string | undefined;
  let force = false;
  let dryRun = false;
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === undefined) {
      continue;
    }

    if (argument === "--force") {
      force = true;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "-y" || argument === "--yes") {
      yes = true;
    } else if (argument === "--no-autoload") {
      autoload = [];
    } else if (argument === "--autoload") {
      const next = argv[++i];
      if (next === undefined || next.startsWith("-")) {
        throw new UsageError(`${argument} requires a comma-separated list, or "none"`);
      }
      autoload = parseNameList(next);
    } else if (argument.startsWith("--autoload=")) {
      autoload = parseNameList(argument.slice("--autoload=".length));
    } else if (argument === "--gitignore") {
      updateGitignore = true;
    } else if (argument === "--no-gitignore") {
      updateGitignore = false;
    } else if (argument === "--backup") {
      backup = true;
    } else if (argument === "--no-backup") {
      backup = false;
    } else if (argument === "--migrate-instructions") {
      migrateInstructions = true;
    } else if (argument === "--no-migrate-instructions") {
      migrateInstructions = false;
    } else if (argument === "--track-version") {
      trackVersion = true;
    } else if (argument === "--no-track-version") {
      trackVersion = false;
    } else if (argument === "--claude-md") {
      createClaudeMd = true;
    } else if (argument === "--no-claude-md") {
      createClaudeMd = false;
    } else if (argument === "--update" || argument === "--fresh" || argument === "--rescaffold") {
      const requested: ScaffoldMode = argument === "--update" ? "update" : "fresh";
      if (mode !== undefined && mode !== requested) {
        throw new UsageError("--update and --fresh cannot be combined");
      }
      mode = requested;
    } else if (argument === "--no-extras") {
      extras = [];
    } else if (argument === "--extras") {
      const next = argv[++i];
      if (next === undefined || next.startsWith("-")) {
        throw new UsageError(`${argument} requires a comma-separated list, or "none"`);
      }
      extras = parseNameList(next);
    } else if (argument.startsWith("--extras=")) {
      extras = parseNameList(argument.slice("--extras=".length));
    } else if (argument === "--no-tools") {
      tools = [];
    } else if (argument === "--tools") {
      const next = argv[++i];
      if (next === undefined || next.startsWith("-")) {
        throw new UsageError(`${argument} requires a comma-separated list, or "none"`);
      }
      tools = parseNameList(next);
    } else if (argument.startsWith("--tools=")) {
      tools = parseNameList(argument.slice("--tools=".length));
    } else if (argument === "--options") {
      const next = argv[++i];
      if (next === undefined || next.startsWith("-")) {
        throw new UsageError(`${argument} requires a comma-separated list, or "none"`);
      }
      chosenOptions = parseNameList(next);
    } else if (argument.startsWith("--options=")) {
      chosenOptions = parseNameList(argument.slice("--options=".length));
    } else if (argument === "--no-skills") {
      skills = [];
    } else if (argument === "--folders" || argument === "--skills") {
      const next = argv[++i];
      if (next === undefined || next.startsWith("-")) {
        throw new UsageError(`${argument} requires a comma-separated list, or "none"`);
      }
      const parsed = parseNameList(next);
      if (argument === "--folders") {
        folders = parsed;
      } else {
        skills = parsed;
      }
    } else if (argument.startsWith("--folders=")) {
      folders = parseNameList(argument.slice("--folders=".length));
    } else if (argument.startsWith("--skills=")) {
      skills = parseNameList(argument.slice("--skills=".length));
    } else if (argument === "--environment") {
      const next = argv[++i];
      if (!next || next.startsWith("-")) {
        throw new UsageError(`${argument} requires constraint text`);
      }
      environment = next;
    } else if (argument.startsWith("--environment=")) {
      environment = argument.slice("--environment=".length);
    } else if (argument === "--wrap") {
      const next = argv[++i];
      if (!next || next.startsWith("-")) {
        throw new UsageError(`${argument} requires a column count, or "no-reflow"`);
      }
      wrap = parseWrapSetting(next, argument);
    } else if (argument.startsWith("--wrap=")) {
      wrap = parseWrapSetting(argument.slice("--wrap=".length), "--wrap");
    } else if (argument === "--config") {
      const next = argv[++i];
      if (!next || next.startsWith("-")) {
        throw new UsageError(`${argument} requires a file path`);
      }
      configPath = next;
    } else if (argument.startsWith("--config=")) {
      configPath = argument.slice("--config=".length);
    } else if (argument === "--folder" || argument === "--folder-name") {
      const next = argv[++i];
      if (!next || next.startsWith("-")) {
        throw new UsageError(`${argument} requires a directory name`);
      }
      folderName = next;
    } else if (argument.startsWith("--folder=")) {
      folderName = argument.slice("--folder=".length);
    } else if (argument.startsWith("--folder-name=")) {
      folderName = argument.slice("--folder-name=".length);
    } else if (argument === "--about" || argument === "--description") {
      const next = argv[++i];
      if (!next || next.startsWith("-")) {
        throw new UsageError(`${argument} requires description text`);
      }
      projectAbout = next;
    } else if (argument.startsWith("--about=")) {
      projectAbout = argument.slice("--about=".length);
    } else if (argument.startsWith("--description=")) {
      projectAbout = argument.slice("--description=".length);
    } else if (argument.startsWith("-")) {
      throw new UsageError(`unknown option ${JSON.stringify(argument)}`);
    } else if (target === undefined) {
      target = argument;
    } else {
      throw new UsageError("init accepts a single target directory");
    }
  }

  return {
    target: resolve(target ?? "."),
    folderName,
    projectAbout,
    autoload,
    updateGitignore,
    trackVersion,
    createClaudeMd,
    mode,
    backup,
    migrateInstructions,
    folders,
    skills,
    options: chosenOptions,
    tools,
    extras,
    configPath,
    wrap,
    environment,
    force,
    dryRun,
    yes,
  };
}

/** The directory holding the scaffold payload shipped with this package. */
export function templateRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");
}

/** The file inside the AI folder naming the ai-scaffold version that wrote the tree. */
export const VERSION_FILE = ".ai-scaffold.version";

/**
 * The file inside the AI folder naming every folder and skill a run has offered, one
 * `folder:<name>` or `skill:<name>` per line. It is what lets an update tell a skill that is
 * new since the last run from one the developer declined.
 */
export const OFFERED_FILE = ".ai-scaffold.offered";

/** The names an earlier run offered, or undefined for an install that predates the record. */
export async function readOffered(offeredFile: string): Promise<Set<string> | undefined> {
  if (!existsSync(offeredFile)) {
    return undefined;
  }
  const lines = (await readFile(offeredFile, "utf8")).split(/\r?\n/).map((line) => line.trim());
  return new Set(lines.filter((line) => line.length > 0 && !line.startsWith("#")));
}

/** This package's version, or "unknown" when its manifest cannot say. */
export async function packageVersion(): Promise<string> {
  const manifest = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8");
  const parsed: unknown = JSON.parse(manifest);
  if (typeof parsed === "object" && parsed !== null && "version" in parsed) {
    const { version } = parsed as { version?: unknown };
    if (typeof version === "string") {
      return version;
    }
  }
  return "unknown";
}

/** Replaces references to .ai with the customized folder name across template files. */
export function transformAiReferences(content: string, folderName: string): string {
  if (folderName === ".ai") {
    return content;
  }
  return content.replace(/(?<![\w-])\.ai(?=[/\s`'"\)]|$)/g, folderName);
}

/**
 * Why a name cannot be the AI folder, or undefined when it can.
 *
 * The folder must be a direct child of the target: every path the scaffold writes, and every
 * folder a re-run may remove, is joined onto it. A config file found in the target supplies this
 * name too, so it is checked like any other untrusted input.
 */
export function folderNameProblem(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "cannot be empty";
  }
  if (/[\\/]/.test(trimmed)) {
    return "cannot contain slashes";
  }
  if (trimmed === "." || trimmed === ".." || trimmed.toLowerCase() === ".git") {
    return `cannot be ${trimmed}`;
  }
  return undefined;
}

/** How a target repository already carries agent tooling, if it does at all. */
export type ExistingInstall =
  | { readonly kind: "none" }
  | { readonly kind: "scaffold"; readonly folderName: string }
  | { readonly kind: "agents-md" };

/** Subdirectories that mark a directory as an AI folder rather than ordinary documentation. */
const AI_FOLDER_MARKERS = ["skills", "prompts", "context", "templates"] as const;

/** Directories never worth scanning for an AI folder, either by convention or by cost. */
const UNSCANNED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "docs",
  "node_modules",
  "target",
  "vendor",
]);

/**
 * Recognises an AI folder by its shape rather than its name, so a tree created with
 * `--folder` is still found when `init` is re-run without that flag.
 */
function isAiFolder(candidate: string): boolean {
  if (!existsSync(join(candidate, "_index.md"))) {
    return false;
  }
  return AI_FOLDER_MARKERS.some((marker) => existsSync(join(candidate, marker)));
}

/**
 * Reports whether the target already carries agent tooling, so a re-run can offer to update
 * rather than silently colliding with what is there.
 *
 * An AI folder is the stronger signal and wins over a bare `AGENTS.md`, which only tells us
 * some agent tooling is in use — not necessarily this one.
 */
export async function detectExistingInstall(
  target: string,
  folderNameHint?: string | undefined,
): Promise<ExistingInstall> {
  const named = folderNameHint ?? ".ai";
  if (isAiFolder(join(target, named))) {
    return { kind: "scaffold", folderName: named };
  }

  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || UNSCANNED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    if (isAiFolder(join(target, entry.name))) {
      return { kind: "scaffold", folderName: entry.name };
    }
  }

  if (existsSync(join(target, "AGENTS.md"))) {
    return { kind: "agents-md" };
  }

  return { kind: "none" };
}

export interface PlanOptions {
  readonly target: string;
  readonly folderName: string;
  readonly projectAbout?: string | undefined;
  readonly updateGitignore: boolean;
  readonly autoload?: readonly string[];
  readonly createClaudeMd: boolean;
  /** Folders under the AI folder to write. Undefined writes every folder shipped. */
  readonly folders?: readonly string[] | undefined;
  /** Skills to write. Undefined writes every skill shipped. */
  readonly skills?: readonly string[] | undefined;
  /** Options guarded prose is resolved against, addressed as `option:<name>`. */
  readonly chosenOptions?: readonly string[] | undefined;
  /** External providers to install, by name. Their skills come from the vendored tree. */
  readonly providers?: readonly Provider[] | undefined;
  /** Extras chosen through the advanced flow, by name. */
  readonly providerExtras?: readonly string[] | undefined;
  /** Markdown prose width the emitted convention states. Undefined means the default width. */
  readonly wrap?: string | undefined;
  /** Project constraints written into the environment context file, replacing its placeholder. */
  readonly environment?: string | undefined;
  /** The ai-scaffold version to record in the AI folder. Undefined records none. */
  readonly scaffoldVersion?: string | undefined;
  /** Every folder and skill this run offered, as `folder:<name>` and `skill:<name>`. Undefined records none. */
  readonly offered?: readonly string[] | undefined;
}

export interface PlannedFile {
  readonly relativePath: string;
  readonly destination: string;
  readonly contents: Buffer;
  readonly exists: boolean;
  readonly isAppend?: boolean | undefined;
}

/** Files that describe one machine and are never committed, indexed or shipped. */
const LOCAL_FILE_PATTERN = "*.local.md";

/**
 * Puts a developer's constraints where the environment template holds its placeholder.
 *
 * Only the constraints section is answered this way. The toolchain region is detected, and
 * the deployed environments are a table a person has to fill in with care.
 */
export function withConstraints(template: string, constraints: string): string {
  return template.replace(/(## Constraints\r?\n\r?\n)<placeholder>[\s\S]*?<\/placeholder>/, (_match, heading: string) => {
    return `${heading}${constraints.trim()}`;
  });
}

function buildProjectMd(projectAbout: string): string {
  return `# Project context

> **This file is a scaffold.** Replace the remaining placeholder text, then delete this note and change the status in [\`_index.md\`](_index.md)
> from \`Draft\` to \`Current\`.

## What this is

${projectAbout.trim()}

## Current phase

<placeholder>What state is the work in right now — early exploration, active build, maintenance? Link to the plan or issue tracker that
holds the detail. Keep this to a sentence or two; detail belongs in planning documents or trackers, not here.</placeholder>

## Repository rules

<placeholder>The rules an agent must respect that are about the work rather than the machine: what must never be committed, how changes are
reviewed, anything that would be expensive to get wrong. Runtimes, commands and environments belong in [\`environment.md\`](environment.md).</placeholder>

## Licensing

<placeholder>The license, where it is declared, and whether a LICENSE file exists. If the intent is recorded but not yet formalised,
say so rather than letting an agent assume.</placeholder>
`;
}

/**
 * Builds the complete list of files a scaffold would write, before writing any of them.
 */
export async function planScaffold(options: PlanOptions): Promise<PlannedFile[]> {
  const planned: PlannedFile[] = [];
  const root = templateRoot();

  // 1. CLAUDE.md
  if (options.createClaudeMd) {
    const claudeDestination = join(options.target, "CLAUDE.md");
    const autoload = options.autoload ?? [];
    // An existing CLAUDE.md is the developer's file: only the generated region is rewritten,
    // which is why this entry appends rather than replacing like a fresh write would.
    const existingClaude = existsSync(claudeDestination)
      ? await readFile(claudeDestination, "utf8")
      : undefined;
    // A CLAUDE.md this tool wrote is updated in its generated region alone. Someone else's
    // file is a collision like any other, and blocks the run rather than being edited.
    const ours = existingClaude !== undefined && isScaffoldClaudeMd(existingClaude);
    const claudeContents =
      existingClaude === undefined
        ? renderClaudeMd(options.folderName, autoload)
        : ours
          ? withAutoloadRegion(existingClaude, options.folderName, autoload)
          : renderClaudeMd(options.folderName, autoload);
    planned.push({
      relativePath: "CLAUDE.md",
      destination: claudeDestination,
      contents: Buffer.from(claudeContents, "utf8"),
      exists: existingClaude !== undefined,
      isAppend: ours,
    });
  }

  // 2. AI folder contents (templates/.ai)
  const templateAiRoot = join(root, ".ai");
  const selectedFolders = options.folders ? new Set(options.folders) : undefined;
  const selectedSkills = options.skills ? new Set(options.skills) : undefined;

  /** Whether a path below the AI folder survives the developer's selection. */
  function isSelected(relUnderAi: string): boolean {
    const segments = relUnderAi.split(/[\\/]/);
    const [folder, child] = segments;
    if (folder === undefined || segments.length < 2) {
      return true; // The AI folder's own index is never optional.
    }
    if (selectedFolders && !selectedFolders.has(folder)) {
      return false;
    }
    if (folder === "skills" && selectedSkills && child !== undefined && segments.length > 2) {
      return selectedSkills.has(child);
    }
    return true;
  }

  const selectedPaths: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      const relUnderAi = relative(templateAiRoot, absolute);
      if (isSelected(relUnderAi)) {
        selectedPaths.push(relUnderAi);
      }
    }
  }

  await walk(templateAiRoot);

  // Guards are resolved against the whole selection, so a file may refer to one written after it.
  // The wrap setting joins them as a condition, so the convention it writes has one wording per
  // answer instead of a sentence that tries to cover both.
  const wrap = options.wrap ?? DEFAULT_WRAP;
  const conditions = [...(options.chosenOptions ?? []), ...(reflows(wrap) ? [REFLOW_OPTION] : [])];
  const isPresent = conditionsFor(selectedPaths, conditions);

  for (const relUnderAi of selectedPaths) {
    const relativePath = join(options.folderName, relUnderAi);
    const destination = join(options.target, relativePath);

    let rawContent: string;
    if (relUnderAi === "context/project.md" && options.projectAbout && options.projectAbout.trim().length > 0) {
      rawContent = buildProjectMd(options.projectAbout);
    } else {
      rawContent = await readFile(join(templateAiRoot, relUnderAi), "utf8");
    }
    if (relUnderAi === "context/environment.md" && options.environment && options.environment.trim().length > 0) {
      rawContent = withConstraints(rawContent, options.environment);
    }

    const resolved = removeFrontmatterFields(applyRequirements(rawContent, isPresent), SCAFFOLDER_FIELDS);
    const transformed = applyWrapWidth(transformAiReferences(resolved, options.folderName), wrap);
    planned.push({
      relativePath,
      destination,
      contents: Buffer.from(transformed, "utf8"),
      exists: existsSync(destination),
    });
  }

  // 3a. A .gitignore inside the AI folder for the machine-local environment file. It lives here
  // rather than at the root because it must hold whether or not the folder itself is ignored,
  // and because the root .gitignore is the developer's to leave alone with --no-gitignore.
  // Generated rather than shipped: npm does not publish a file named .gitignore.
  if (selectedPaths.includes(join("context", "environment.md"))) {
    const relativePath = join(options.folderName, ".gitignore");
    const destination = join(options.target, relativePath);
    const existing = existsSync(destination) ? await readFile(destination, "utf8") : undefined;
    const alreadyIgnored = existing?.split(/\r?\n/).some((line) => line.trim() === LOCAL_FILE_PATTERN) ?? false;
    if (!alreadyIgnored) {
      const prefix = existing === undefined ? "" : `${existing}${existing.length > 0 && !existing.endsWith("\n") ? "\n" : ""}`;
      planned.push({
        relativePath,
        destination,
        contents: Buffer.from(`${prefix}${LOCAL_FILE_PATTERN}\n`, "utf8"),
        exists: existing !== undefined,
        isAppend: existing !== undefined,
      });
    }
  }

  // 3b. Formatter configuration, when the developer asked for one. It goes inside the AI
  // folder because that is the only ground this tool owns: a config at the repository root
  // would set formatting policy for files the scaffold has nothing to do with.
  const formatterConfig = formatterConfigFor(conditions, wrap);
  if (formatterConfig && (options.skills === undefined || options.skills.includes(FORMATTER_SKILL))) {
    const relativePath = join(options.folderName, formatterConfig.name);
    const destination = join(options.target, relativePath);
    planned.push({
      relativePath,
      destination,
      contents: Buffer.from(formatterConfig.contents, "utf8"),
      exists: existsSync(destination),
    });
  }

  // 3c. The version that wrote the tree, so an older install can be told apart before it is
  // upgraded. A dotfile, so no index ever lists it.
  if (options.scaffoldVersion !== undefined) {
    const relativePath = join(options.folderName, VERSION_FILE);
    const destination = join(options.target, relativePath);
    planned.push({
      relativePath,
      destination,
      contents: Buffer.from(
        `# Used to keep track of which ai-scaffold version scaffolded this folder.\n${options.scaffoldVersion}\n`,
        "utf8",
      ),
      exists: existsSync(destination),
    });
  }

  // 3d. What this run offered. Rewritten on every run, update included, since it describes the
  // menus rather than any file the developer might have edited.
  if (options.offered !== undefined) {
    const relativePath = join(options.folderName, OFFERED_FILE);
    const destination = join(options.target, relativePath);
    const contents = `# Folders and skills ai-scaffold has offered here, so an update can tell a new one from a declined one.\n${options.offered.join("\n")}\n`;
    const existing = existsSync(destination) ? await readFile(destination, "utf8") : undefined;
    planned.push({
      relativePath,
      destination,
      contents: Buffer.from(contents, "utf8"),
      exists: existing !== undefined,
      // An unchanged record is skipped like any other file, so a no-op update stays one.
      isAppend: existing !== undefined && existing !== contents,
    });
  }

  // 4. .gitignore
  if (options.updateGitignore) {
    const gitignorePath = join(options.target, ".gitignore");
    const exists = existsSync(gitignorePath);
    const pattern = options.folderName.replace(/^\/+|\/+$/g, "");

    if (exists) {
      const rawGitignore = await readFile(gitignorePath, "utf8");
      const lines = rawGitignore.split(/\r?\n/).map((line) => line.trim());
      const alreadyIgnored = lines.some((line) => {
        const trimmed = line.replace(/^\/+|\/+$/g, "");
        return trimmed === pattern;
      });

      if (!alreadyIgnored) {
        const appendNewline = rawGitignore.length > 0 && !rawGitignore.endsWith("\n");
        const updated = `${rawGitignore}${appendNewline ? "\n" : ""}${options.folderName}/\n`;
        planned.push({
          relativePath: ".gitignore",
          destination: gitignorePath,
          contents: Buffer.from(updated, "utf8"),
          exists: true,
          isAppend: true,
        });
      }
    } else {
      planned.push({
        relativePath: ".gitignore",
        destination: gitignorePath,
        contents: Buffer.from(`${options.folderName}/\n`, "utf8"),
        exists: false,
        isAppend: false,
      });
    }
  }

  // 3. Vendored external skills. They are copies, so each arrives with its licence and the
  // note saying where it came from; readVendoredSkills refuses an incomplete one.
  if (options.providers && options.providers.length > 0) {
    const skillsFolder = join(options.folderName, "skills");
    const external = [
      ...(await readVendoredSkills(options.providers, options.providerExtras ?? [], skillsFolder)),
      // A tool installed machine-wide vendors nothing, so its usage skill is one we wrote.
      ...(
        await Promise.all(
          options.providers
            .filter((provider) => !provider.source && provider.requiresBinary)
            .map((provider) => readLocalProviderSkill(provider, skillsFolder)),
        )
      ).flat(),
    ];

    for (const file of external) {
      const destination = join(options.target, file.relativePath);
      planned.push({
        relativePath: file.relativePath,
        destination,
        contents: file.contents,
        exists: existsSync(destination),
      });
    }
  }

  // AGENTS.md is written last because its guarded prose depends on the whole selection.
  const rawAgents = await readFile(join(root, "AGENTS.md"), "utf8");
  const agentsDestination = join(options.target, "AGENTS.md");
  planned.push({
    relativePath: "AGENTS.md",
    destination: agentsDestination,
    contents: Buffer.from(
      applyWrapWidth(transformAiReferences(applyRequirements(rawAgents, isPresent), options.folderName), wrap),
      "utf8",
    ),
    exists: existsSync(agentsDestination),
  });

  planned.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return planned;
}

/** Rejects a name the payload does not ship, naming the valid choices rather than guessing. */
function assertKnownNames(flag: string, requested: readonly string[], available: readonly string[]): void {
  const known = new Set(available);
  const unknown = requested.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new UsageError(
      `${flag}: unknown ${unknown.length === 1 ? "name" : "names"} ${unknown.map((name) => JSON.stringify(name)).join(", ")}; available: ${available.join(", ") || "none"}`,
    );
  }
}

/** Where an autoloadable skill's `SKILL.md` ships from: our own skills, vendored ones, and the skills tools bring. */
function autoloadRoots(templateAiRoot: string): string[] {
  return [join(templateAiRoot, "skills"), vendorSkillsRoot(), providerTemplatesRoot()];
}

/** Names of the direct subfolders already present in a scaffolded AI folder. */
async function installedFolders(aiRoot: string): Promise<string[]> {
  if (!existsSync(aiRoot)) {
    return [];
  }
  const entries = await readdir(aiRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

export async function runInit(argv: readonly string[]): Promise<ExitCode> {
  const given = parseInitArguments(argv);

  if (!existsSync(given.target)) {
    throw new UsageError(`target directory ${given.target} does not exist`);
  }

  // The file fills in what the command line left open, so a flag still decides its own setting.
  const configFile = locateConfig(given.target, given.configPath);
  const options = configFile ? withConfig(given, await readConfig(configFile)) : given;

  const folderProblem = options.folderName === undefined ? undefined : folderNameProblem(options.folderName);
  if (folderProblem !== undefined) {
    throw new UsageError(`folder name ${JSON.stringify(options.folderName)} ${folderProblem}`);
  }

  const existing = await detectExistingInstall(options.target, options.folderName);

  // A file found beside a tree it already scaffolded is either a pinned layout, which a re-run
  // must not override, or a leftover, which must not steer one. Neither is safe to guess, so
  // only --config applies it; deleting it brings the menus back.
  if (configFile !== undefined && given.configPath === undefined && existing.kind === "scaffold") {
    const name = relative(options.target, configFile);
    throw new UsageError(
      `${name} is for a first scaffold, and ${existing.folderName}/ is already scaffolded; delete it to choose again, or pass --config ${name} to apply it as written`,
    );
  }

  // An explicit --folder still wins; otherwise reuse the tree that is already there rather
  // than scaffolding a second one beside it.
  let folderName =
    options.folderName ?? (existing.kind === "scaffold" ? existing.folderName : undefined);
  let projectAbout = options.projectAbout;
  let updateGitignore = options.updateGitignore;
  let trackVersion = options.trackVersion;
  let backup = options.backup;
  let migrateInstructions = options.migrateInstructions;
  let autoload = options.autoload;
  let createClaudeMd = options.createClaudeMd;
  // --force has always meant "replace what is there", which is exactly a fresh scaffold.
  let mode = options.mode ?? (options.force ? "fresh" : undefined);

  const templateAiRoot = join(templateRoot(), ".ai");
  const availableFolders = await readTemplateFolders(templateAiRoot);
  const authoredSkills = await readSkills(join(templateAiRoot, "skills"));
  const catalogue = await readManifest();
  const externalSkills = providersOfKind(catalogue, "skill");
  const availableTools = providersOfKind(catalogue, "tool");
  const optionalFolders = availableFolders;

  // One namespace for the skills menu. A developer choosing between them should not have to
  // know which ones this repository wrote, only what each does and who to credit.
  const skillNames = [
    ...authoredSkills.map((skill) => skill.name),
    ...externalSkills.map((provider) => provider.name),
  ];

  if (options.folders) {
    assertKnownNames("--folders", options.folders, optionalFolders);
  }
  if (options.skills) {
    assertKnownNames("--skills", options.skills, skillNames);
  }
  if (options.tools) {
    assertKnownNames(
      "--tools",
      options.tools,
      availableTools.map((provider) => provider.name),
    );
  }

  // Updating an existing tree keeps to what that tree already has, so a folder a developer
  // declined earlier is not quietly reinstated. Something added since the last run was never
  // declined, though, so it is ticked as it would be on a first scaffold. An install from before
  // the record existed cannot say what it was offered, so everything it lacks counts as new.
  const present = await installedFolders(join(options.target, folderName ?? ".ai"));
  const offered = existing.kind === "scaffold" ? await readOffered(join(options.target, existing.folderName, OFFERED_FILE)) : undefined;
  const isNew = (kind: "folder" | "skill", name: string): boolean => offered === undefined || !offered.has(`${kind}:${name}`);
  const defaultFolders =
    existing.kind === "scaffold"
      ? optionalFolders.filter((name) => present.includes(name) || (!OPT_IN_FOLDERS.has(name) && isNew("folder", name)))
      : optionalFolders.filter((name) => !OPT_IN_FOLDERS.has(name));
  // External skills are opt-in: a first scaffold takes what this repository wrote and nothing
  // else. A re-run keeps whatever is installed, external skills included.
  const installedSkills = (await readSkills(join(options.target, folderName ?? ".ai", "skills"))).map(
    (skill) => skill.name,
  );
  // A skill bound to a folder follows that folder: offered when it is there, left out when it
  // is not, so a first scaffold never installs guidance about a directory it did not write.
  const selectedFolders = new Set(options.folders ?? defaultFolders);
  const firstScaffoldSkills = authoredSkills
    .filter((skill) => skill.requiresFolder === undefined || selectedFolders.has(skill.requiresFolder))
    .map((skill) => skill.name);
  const defaultSkills =
    existing.kind === "scaffold"
      ? skillNames.filter((name) => installedSkills.includes(name) || (firstScaffoldSkills.includes(name) && isNew("skill", name)))
      : firstScaffoldSkills;
  const defaultTools =
    existing.kind === "scaffold"
      ? availableTools.filter((tool) => installedSkills.includes(tool.name)).map((tool) => tool.name)
      : [];

  let folders = options.folders ? [...options.folders] : undefined;
  let skills = options.skills ? [...options.skills] : undefined;
  let chosenOptions = options.options ? [...options.options] : undefined;
  let tools = options.tools ? [...options.tools] : undefined;
  let providerExtras = options.extras ? [...options.extras] : undefined;

  const isInteractive = !options.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (isInteractive) {
    intro("ai-scaffold");

    if (existing.kind !== "none" && mode === undefined) {
      const message =
        existing.kind === "scaffold"
          ? `Detected an existing ai-scaffold install in ${existing.folderName}/. Update it or re-scaffold fresh?`
          : "It looks like the project is already using agent tooling. Would you want to update it or re-scaffold?";
      const choice = await select<ScaffoldMode>({
        message,
        initialValue: "update",
        options: [
          {
            value: "update",
            label: "Update",
            hint: "add what is missing, leave existing files untouched",
          },
          {
            value: "fresh",
            label: "Re-scaffold fresh",
            hint: "replace every scaffold file with the shipped version",
          },
        ],
      });
      if (isCancel(choice)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      mode = choice;
    }

    if (folderName === undefined) {
      const input = await text({
        message: "Name for AI tool folder:",
        placeholder: ".ai",
        defaultValue: ".ai",
        initialValue: ".ai",
        validate(value) {
          const problem = folderNameProblem(value ?? "");
          return problem === undefined ? undefined : `Folder name ${problem}`;
        },
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      folderName = input.trim();
    }

    // A fresh run replaces files and an update can remove what was unticked, so either one over
    // an existing setup is worth a copy first. Only a fresh run has anything to migrate back.
    if (existing.kind !== "none") {
      if (backup === undefined) {
        const input = await confirm({
          message: `Back up the current setup to ${folderName}/${BACKUP_FOLDER} first?`,
          initialValue: true,
        });
        if (isCancel(input)) {
          cancel("Operation cancelled.");
          return ExitCode.Success;
        }
        backup = input;
      }
      if (backup && mode === "fresh" && migrateInstructions === undefined) {
        const input = await confirm({
          message: `Add ${MIGRATE_INSTRUCTIONS} to the backup, telling an agent how to migrate it?`,
          initialValue: true,
        });
        if (isCancel(input)) {
          cancel("Operation cancelled.");
          return ExitCode.Success;
        }
        migrateInstructions = input;
      }
    }

    // An update keeps the files an older version wrote, so it never records a version and
    // asking would change nothing.
    if (trackVersion === undefined && !(mode === "update" && existing.kind === "scaffold")) {
      const input = await confirm({
        message: `Track the ai-scaffold version in ${folderName}?`,
        initialValue: true,
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      trackVersion = input;
    }

    if (folders === undefined && optionalFolders.length > 0) {
      const input = await multiselect<string>({
        message: `Which folders should ${folderName} contain?`,
        required: false,
        initialValues: [...defaultFolders],
        options: optionalFolders.map((name) => ({
          value: name,
          label: `${name}/`,
          ...(FOLDER_HINTS[name] === undefined ? {} : { hint: FOLDER_HINTS[name] }),
        })),
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      folders = input;
    }

    const wantsSkills = (folders ?? defaultFolders).includes("skills");

    if (skills === undefined && wantsSkills && skillNames.length > 0) {
      const input = await multiselect<string>({
        // The menu scrolls once it is taller than the terminal, so the count says there is more.
        message: `Which skills should be installed? (${skillNames.length} available)`,
        required: false,
        initialValues: [...defaultSkills],
        options: [
          ...authoredSkills.map((skill) => ({
            value: skill.name,
            label: skill.name,
            hint: firstSentence(skill.description),
          })),
          // An external skill names its author in the menu, so credit is visible at the
          // moment someone decides to install it rather than only afterwards.
          ...externalSkills.map((provider) => ({
            value: provider.name,
            label: provider.name,
            hint: `${provider.summary} · ${provider.author}, ${provider.license}`,
          })),
        ],
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      skills = input;
    }

    if (tools === undefined && wantsSkills && availableTools.length > 0) {
      const input = await multiselect<string>({
        message: "Which tools should be installed?",
        required: false,
        initialValues: [...defaultTools],
        options: availableTools.map((provider) => ({
          value: provider.name,
          label: provider.name,
          hint: `${provider.summary} · ${provider.author}, ${provider.license}`,
        })),
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      tools = input;
    }

    // Asked after the selection, because the choice is which of the installed skills apply
    // without being asked for — a subset of what was just chosen, never a separate catalogue.
    // A tool installs a skill under its own name, so it can be loaded the same way.
    const installable = [...(skills ?? []), ...(tools ?? [])];
    if (autoload === undefined && installable.length > 0) {
      const input = await multiselect({
        message: "Which of these should load in every session?",
        required: false,
        initialValues: [],
        options: await Promise.all(
          installable.map(async (skill) => ({
            value: skill,
            label: skill,
            hint: `+${await autoloadCost(autoloadRoots(templateAiRoot), [skill])} words in every session`,
          })),
        ),
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      autoload = input;
    }

    // Asking about the project only to skip writing project.md would waste the answer.
    const projectMdPath = join(options.target, folderName ?? ".ai", "context", "project.md");
    const projectMdKept = existsSync(projectMdPath) && mode !== "fresh";

    if (projectAbout === undefined && !projectMdKept) {
      const input = await multiline({
        message: "What is the project about? (press Enter twice to submit, or submit empty to skip)",
        placeholder: "Brief description of the project and its goals...",
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      if (typeof input === "string" && input.trim().length > 0) {
        projectAbout = input.trim();
      }
    }

    if (updateGitignore === undefined) {
      const input = await confirm({
        message: `Exclude ${folderName} from git? Handoffs, specs and research would then stay on this machine.`,
        initialValue: false,
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      updateGitignore = input;
    }

    if (createClaudeMd === undefined) {
      const input = await confirm({
        message: "Create CLAUDE.md (referencing @AGENTS.md)?",
        initialValue: true,
      });
      if (isCancel(input)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }
      createClaudeMd = input;
    }

    // Everything selected, whichever menu it came from, so one flow covers both.
    const selection = [...(skills ?? defaultSkills), ...(tools ?? defaultTools)];
    const choices = advancedChoicesFor(authoredSkills, catalogue, selection).filter((choice) => {
      // An answer only takes effect on the run that writes the file it governs. Update mode
      // leaves an installed skill alone, so asking about it would change nothing.
      if (choice.kind !== "toggle" || mode !== "update") {
        return true;
      }
      return !existsSync(join(options.target, folderName ?? ".ai", "skills", choice.owner, "SKILL.md"));
    });

    if (chosenOptions === undefined && providerExtras === undefined && hasAdvancedChoices(choices)) {
      const customise = await confirm({
        message: "Customise advanced options?",
        initialValue: false,
      });
      if (isCancel(customise)) {
        cancel("Operation cancelled.");
        return ExitCode.Success;
      }

      if (customise) {
        const answered = new Map<AdvancedChoice, readonly string[] | boolean>();
        for (const choice of choices) {
          if (choice.kind === "toggle") {
            const input = await confirm({ message: `${choice.owner}: ${choice.prompt}`, initialValue: false });
            if (isCancel(input)) {
              cancel("Operation cancelled.");
              return ExitCode.Success;
            }
            answered.set(choice, input);
            continue;
          }

          const input = await multiselect<string>({
            message: choice.prompt,
            required: false,
            initialValues: [],
            options: choice.picks.map((pick) => ({ value: pick.name, label: pick.name, hint: pick.summary })),
          });
          if (isCancel(input)) {
            cancel("Operation cancelled.");
            return ExitCode.Success;
          }
          answered.set(choice, input);
        }

        const answers = collectAnswers(answered);
        chosenOptions = [...answers.options];
        providerExtras = [...answers.extras];
      }
    }
  }

  // A re-run defaults to what the install already loads, like every other selection.
  autoload = autoload ?? (existing.kind === "scaffold" ? await readAutoload(options.target, existing.folderName) : undefined);
  folderName = folderName ?? ".ai";
  folders = folders ?? defaultFolders;
  // A skills folder nobody asked for cannot hold skills, external ones included.
  skills = folders.includes("skills") ? (skills ?? defaultSkills) : [];
  tools = folders.includes("skills") ? (tools ?? defaultTools) : [];
  // Declining the advanced flow, or never being offered it, means the defaults stand:
  // every toggle off and no bundled extras.
  const loadable = [...skills, ...tools];
  if (options.autoload !== undefined) {
    assertKnownNames("--autoload", options.autoload, loadable);
  }
  autoload = (autoload ?? []).filter((skill) => loadable.includes(skill));
  chosenOptions = chosenOptions ?? [...NO_CUSTOMISATION.options];
  providerExtras = providerExtras ?? [...NO_CUSTOMISATION.extras];

  assertKnownNames(
    "--options",
    chosenOptions,
    authoredSkills.flatMap((skill) => skill.options.map((option) => option.name)),
  );

  // Everything chosen from the catalogue, whichever menu it came from.
  const chosenProviders = catalogue.filter(
    (provider) => skills.includes(provider.name) || tools.includes(provider.name),
  );

  assertKnownNames(
    "--extras",
    providerExtras,
    chosenProviders.flatMap((provider) => (provider.extras ?? []).map((extra) => extra.name)),
  );
  updateGitignore = updateGitignore ?? false;
  createClaudeMd = createClaudeMd ?? true;
  // Non-interactive runs over an existing install take the conservative branch.
  mode = mode ?? (existing.kind === "none" ? undefined : "update");

  // Whether an existing file gets replaced. Update mode never replaces; it only fills gaps.
  const replaceExisting = options.force || mode === "fresh";
  // Updating keeps what an older version wrote, so stamping the current version on that tree
  // would misdate it. Only a run that writes the whole scaffold records one.
  const recordsVersion = (trackVersion ?? true) && (existing.kind !== "scaffold" || replaceExisting);
  // A fresh run backs up unless told not to. An update only when asked, so a repeated run with
  // no TTY does not stop on the backup the previous one left behind.
  const backupRoot =
    existing.kind !== "none" && (backup ?? replaceExisting) ? join(options.target, folderName, BACKUP_FOLDER) : undefined;
  const writesInstructions = backupRoot !== undefined && replaceExisting && (migrateInstructions ?? true);

  // A second backup over the first would lose the only copy of a setup nobody has migrated yet.
  if (backupRoot !== undefined && existsSync(backupRoot)) {
    throw new UsageError(
      `${folderName}/${BACKUP_FOLDER} already holds a backup; migrate and delete it first, or pass --no-backup`,
    );
  }

  if (!isInteractive && existing.kind !== "none") {
    const what =
      existing.kind === "scaffold"
        ? `existing ai-scaffold install in ${existing.folderName}/`
        : "existing agent tooling (AGENTS.md)";
    const action = replaceExisting ? "re-scaffolding fresh" : "updating (pass --fresh to replace)";
    process.stdout.write(`detected ${what}; ${action}\n\n`);
  }

  // The scaffold never installs a program. It says what is missing and where to get it.
  for (const missing of missingBinaries(chosenProviders)) {
    const hint = missing.hint ? `install it with "${missing.hint}"` : `see ${missing.homepage}`;
    const message = `${missing.provider} needs "${missing.binary}", which is not on PATH; ${hint}. The skill is still installed.`;
    if (isInteractive) {
      log.warn(message);
    } else {
      process.stderr.write(`warning: ${message}\n`);
    }
  }

  if (autoload.length > 0) {
    const words = await autoloadCost(autoloadRoots(templateAiRoot), autoload);
    const message = `loading in every session: ${autoload.join(", ")} (+${words.toLocaleString("en-US")} words)`;
    if (isInteractive) {
      log.message(message);
    } else {
      process.stdout.write(`${message}\n`);
    }
  }

  const planOptions: PlanOptions = {
    target: options.target,
    folderName,
    projectAbout,
    updateGitignore,
    createClaudeMd,
    autoload,
    folders,
    skills,
    chosenOptions,
    providers: chosenProviders,
    providerExtras,
    wrap: options.wrap,
    environment: options.environment,
    scaffoldVersion: recordsVersion ? await packageVersion() : undefined,
    offered: [...optionalFolders.map((name) => `folder:${name}`), ...skillNames.map((name) => `skill:${name}`)],
  };
  const plan = await planScaffold(planOptions);

  // Unticking something installed removes it, but only when nothing in it was changed: a file
  // the developer edited or added is theirs, so that folder or skill is kept with a note. A
  // provider takes its extras with it. A renamed folder is a new tree, so it has nothing to drop.
  const chosenNames = new Set([...skills, ...tools]);
  const droppedProviders = catalogue.filter((provider) => installedSkills.includes(provider.name) && !chosenNames.has(provider.name));
  const dropped =
    existing.kind === "scaffold" && existing.folderName === folderName
      ? [
          ...optionalFolders.filter((name) => present.includes(name) && !folders.includes(name)),
          ...(folders.includes("skills")
            ? [
                ...authoredSkills.map((skill) => skill.name).filter((name) => installedSkills.includes(name) && !chosenNames.has(name)),
                ...droppedProviders.flatMap((provider) => [provider.name, ...(provider.extras ?? []).map((extra) => extra.name)]),
              ]
                .filter((name) => existsSync(join(options.target, folderName, "skills", name)))
                .map((name) => join("skills", name))
            : []),
        ]
      : [];
  const removals: { readonly path: string; readonly changed: readonly string[] }[] = [];
  if (dropped.length > 0) {
    // Compared against what this version writes for the tree as it stands, since guarded prose
    // reads differently depending on which folders and skills sit beside it.
    const everything = await planScaffold({
      ...planOptions,
      folders: optionalFolders.filter((name) => present.includes(name)),
      skills: installedSkills,
      providers: catalogue.filter((provider) => installedSkills.includes(provider.name)),
      providerExtras: catalogue.flatMap((provider) => (provider.extras ?? []).map((extra) => extra.name)).filter((name) => installedSkills.includes(name)),
    });
    const reference = new Map(everything.map((entry) => [entry.relativePath, entry.contents]));
    for (const name of dropped) {
      const path = join(folderName, name);
      removals.push({ path, changed: await changedFiles(options.target, join(options.target, path), reference) });
    }
  }

  // Colliding with an unrecognised tree is still an error; skipping is only safe once the
  // developer has said this is an update.
  const blocked =
    replaceExisting || mode === "update"
      ? []
      : plan.filter((entry) => entry.exists && !entry.isAppend);

  const markerFor = (entry: PlannedFile): string =>
    entry.isAppend ? "update" : entry.exists ? (replaceExisting ? "overwrite" : "skip") : "create";

  const lines = [
    ...plan.map((entry) => `  ${markerFor(entry).padEnd(9)} ${entry.relativePath}`),
    ...removals.map(({ path, changed }) =>
      changed.length === 0
        ? `  ${"remove".padEnd(9)} ${path}/`
        : `  ${"keep".padEnd(9)} ${path}/ (changed: ${changed.join(", ")}; delete it by hand to remove it)`,
    ),
  ];
  if (backupRoot !== undefined) {
    lines.unshift(
      `  ${"backup".padEnd(9)} ${folderName}/${BACKUP_FOLDER}/`,
      ...(writesInstructions ? [`  ${"create".padEnd(9)} ${folderName}/${BACKUP_FOLDER}/${MIGRATE_INSTRUCTIONS}`] : []),
    );
  }
  for (const line of lines) {
    if (isInteractive) {
      log.message(line);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  if (options.dryRun) {
    if (isInteractive) {
      outro(`Dry run: ${plan.length} paths considered, nothing written`);
    } else {
      process.stdout.write(`\ndry run: ${plan.length} paths considered, nothing written\n`);
    }
    return ExitCode.Success;
  }

  if (blocked.length > 0) {
    const message = `refusing to overwrite ${blocked.length} existing file(s); re-run with --fresh to replace them`;
    if (isInteractive) {
      cancel(message);
    } else {
      process.stderr.write(`\n${message}\n`);
    }
    return ExitCode.Failure;
  }

  // The copy is taken before anything is replaced, so it is the setup exactly as it was.
  if (backupRoot !== undefined) {
    const oldFolder = existing.kind === "scaffold" ? existing.folderName : undefined;
    const copied = await backupScaffold(options.target, oldFolder, backupRoot);
    if (writesInstructions) {
      await writeFile(
        join(backupRoot, MIGRATE_INSTRUCTIONS),
        renderMigrateInstructions({
          folderName,
          oldFolder,
          copied,
          previousVersion: oldFolder === undefined ? undefined : await readRecordedVersion(join(backupRoot, oldFolder, VERSION_FILE)),
          currentVersion: await packageVersion(),
          date: new Date().toISOString().slice(0, 10),
        }),
        "utf8",
      );
    }
  }

  for (const { path, changed } of removals) {
    if (changed.length === 0) {
      await rm(join(options.target, path), { recursive: true });
    }
  }

  let written = 0;
  let kept = 0;
  for (const entry of plan) {
    if (entry.exists && !entry.isAppend && !replaceExisting) {
      kept++;
      continue;
    }
    await mkdir(dirname(entry.destination), { recursive: true });
    await writeFile(entry.destination, entry.contents);
    written++;
  }

  // Last step: the index tables and the AGENTS.md skill directives describe what a repository
  // holds, so they are written from the tree that now exists rather than from the payload.
  const reindexed = await reindexScaffold({
    autoload,
    target: options.target,
    folderName,
    templateAiRoot,
  });

  for (const path of reindexed) {
    const line = `  reindex   ${path}`;
    if (isInteractive) {
      log.message(line);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  const summary =
    kept > 0
      ? `${written} file(s) written, ${kept} left unchanged, in ${options.target}`
      : `${written} files into ${options.target}`;

  if (backupRoot !== undefined) {
    const message = writesInstructions
      ? `previous setup backed up; ask your agent to follow ${folderName}/${BACKUP_FOLDER}/${MIGRATE_INSTRUCTIONS}`
      : `previous setup backed up in ${folderName}/${BACKUP_FOLDER}/; delete it once the result is what you want, since the next backup will not replace it`;
    if (isInteractive) {
      log.info(message);
    } else {
      process.stdout.write(`\n${message}\n`);
    }
  }

  if (isInteractive) {
    outro(kept > 0 ? `Updated ${summary}` : `Scaffolded ${summary}`);
  } else {
    process.stdout.write(`\n${kept > 0 ? "updated" : "scaffolded"} ${summary}\n`);
  }

  return ExitCode.Success;
}
