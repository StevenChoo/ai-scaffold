/**
 * A config file that answers `init`'s questions ahead of time.
 *
 * Every choice the interactive flow asks for is also a flag, and a run that always makes the
 * same choices should not have to repeat either. A config file carries them: keys named after
 * the flags, read before the flow starts, so the questions they answer are never asked.
 *
 * Flags still win. A file states what is usually wanted; a flag states what is wanted this
 * time, and the more specific of the two is the one typed at the moment of running.
 *
 * The file is YAML rather than JSON because the values this will grow to hold — a commit
 * message template, prose configuring a skill — are multi-line text, which JSON cannot carry
 * without escaping every newline.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { UsageError } from "../result.js";
import { NO_REFLOW, parseWrapSetting } from "../scaffold/wrap.js";
import type { InitOptions, ScaffoldMode } from "./init.js";

/** The choices a config file may carry, named as the corresponding `InitOptions` fields. */
export interface ScaffoldConfig {
  readonly folderName?: string;
  readonly projectAbout?: string;
  readonly folders?: readonly string[];
  readonly skills?: readonly string[];
  readonly autoload?: readonly string[];
  readonly tools?: readonly string[];
  readonly options?: readonly string[];
  readonly extras?: readonly string[];
  readonly updateGitignore?: boolean;
  readonly trackVersion?: boolean;
  readonly createClaudeMd?: boolean;
  readonly mode?: ScaffoldMode;
  readonly backup?: boolean;
  readonly migrateInstructions?: boolean;
  readonly wrap?: string;
  readonly environment?: string;
}

/**
 * File names looked for in the target directory when no `--config` is given.
 *
 * Both spellings, because half the world writes one and half the other, and being wrong about
 * it produces a run that silently ignores the file.
 */
export const CONFIG_FILE_NAMES = ["ai-scaffold.yaml", "ai-scaffold.yml"] as const;

/** The key each config field is written as, which is the flag name without its dashes. */
const KEYS = {
  folder: "folderName",
  about: "projectAbout",
  folders: "folders",
  skills: "skills",
  autoload: "autoload",
  tools: "tools",
  options: "options",
  extras: "extras",
  gitignore: "updateGitignore",
  "track-version": "trackVersion",
  "claude-md": "createClaudeMd",
  mode: "mode",
  backup: "backup",
  "migrate-instructions": "migrateInstructions",
  wrap: "wrap",
  environment: "environment",
} as const satisfies Record<string, keyof ScaffoldConfig>;

const TEXT_KEYS = ["folder", "about", "environment"] as const;
const LIST_KEYS = ["folders", "skills", "tools", "options", "extras", "autoload"] as const;
const FLAG_KEYS = ["gitignore", "track-version", "claude-md", "backup", "migrate-instructions"] as const;

/** The config file to read for a run, or nothing when neither was given nor found. */
export function locateConfig(target: string, explicit: string | undefined): string | undefined {
  if (explicit !== undefined) {
    return explicit;
  }
  return CONFIG_FILE_NAMES.map((name) => join(target, name)).find((path) => existsSync(path));
}

/**
 * Reads and validates a config file.
 *
 * An explicit path that does not exist is an error: a run told to use a file and silently
 * proceeding without it would scaffold something nobody asked for.
 */
export async function readConfig(path: string): Promise<ScaffoldConfig> {
  if (!existsSync(path)) {
    throw new UsageError(`config file ${path} does not exist`);
  }

  let document: unknown;
  try {
    document = parseYaml(await readFile(path, "utf8"));
  } catch (error) {
    throw new UsageError(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (document === null || document === undefined) {
    return {};
  }
  if (typeof document !== "object" || Array.isArray(document)) {
    throw new UsageError(`${path}: expected a mapping of settings at the top level`);
  }

  const entries = document as Record<string, unknown>;
  const config: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(entries)) {
    if (!(key in KEYS)) {
      throw new UsageError(
        `${path}: unknown setting ${JSON.stringify(key)}; known settings: ${Object.keys(KEYS).join(", ")}`,
      );
    }
    // A key present but empty reads as "not answered", which is what an unfinished file means.
    if (value === null || value === undefined) {
      continue;
    }
    const field = KEYS[key as keyof typeof KEYS];
    config[field] = readValue(path, key, value);
  }

  return config as ScaffoldConfig;
}

/** Validates one setting against the shape its key implies. */
function readValue(path: string, key: string, value: unknown): unknown {
  if ((TEXT_KEYS as readonly string[]).includes(key)) {
    if (typeof value !== "string") {
      throw new UsageError(`${path}: ${key} must be text`);
    }
    return value;
  }

  if ((FLAG_KEYS as readonly string[]).includes(key)) {
    if (typeof value !== "boolean") {
      throw new UsageError(`${path}: ${key} must be true or false`);
    }
    return value;
  }

  if ((LIST_KEYS as readonly string[]).includes(key)) {
    if (!Array.isArray(value) || value.some((name) => typeof name !== "string")) {
      throw new UsageError(`${path}: ${key} must be a list of names, or an empty list for none`);
    }
    return value.map((name) => (name as string).trim()).filter((name) => name.length > 0);
  }

  // A bare `wrap: 160` is a number in YAML, so both spellings of the same answer are taken.
  if (key === "wrap") {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new UsageError(`${path}: wrap must be a column count, or "${NO_REFLOW}"`);
    }
    return parseWrapSetting(String(value), `${path}: wrap`);
  }

  if (value !== "update" && value !== "fresh") {
    throw new UsageError(`${path}: mode must be "update" or "fresh"`);
  }
  return value;
}

/**
 * Fills in what the command line left open.
 *
 * Only fields the flags did not set are taken from the file, so adding a config file never
 * changes what an explicit flag does.
 */
export function withConfig(options: InitOptions, config: ScaffoldConfig): InitOptions {
  const merged: Record<string, unknown> = { ...options };
  for (const field of Object.values(KEYS)) {
    if (merged[field] === undefined && config[field] !== undefined) {
      merged[field] = config[field];
    }
  }
  return merged as unknown as InitOptions;
}
