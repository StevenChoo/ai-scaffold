/**
 * Placing vendored skills into a scaffolded project.
 *
 * A vendored skill is someone else's work under someone else's licence. Copying it onward is
 * permitted only while the copyright notice travels with it, so the licence and the
 * provenance note are not optional extras here: a skill is installed whole or not at all.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Provider } from "./manifest.js";

/** One file to write into the target, as a path relative to the repository being scaffolded. */
export interface InstallableFile {
  readonly relativePath: string;
  readonly contents: Buffer;
}

/** Files that must accompany a copy for it to be lawfully redistributable and traceable. */
const REQUIRED = ["SKILL.md", "LICENSE", "SOURCE.md"] as const;

/** The vendored tree shipped with this package. */
export function vendorSkillsRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "vendor", "skills");
}

/** Raised when a vendored skill cannot be installed as a complete, attributed copy. */
export class InstallError extends Error {
  override readonly name = "InstallError";
}

async function filesUnder(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        found.push(relative(root, absolute).split(/[\\/]/).join("/"));
      }
    }
  }
  await walk(root);
  return found.sort((a, b) => a.localeCompare(b));
}

/**
 * Every skill directory a provider contributes: itself, plus whichever extras were chosen.
 *
 * A provider that only checks for a binary contributes no directory at all; the local skill
 * describing how to use that binary is authored here and travels with the templates.
 */
export function skillDirectoriesFor(
  provider: Provider,
  chosenExtras: readonly string[] = [],
): string[] {
  if (!provider.source) {
    return [];
  }
  const extras = (provider.extras ?? [])
    .filter((extra) => chosenExtras.includes(extra.name))
    .map((extra) => extra.name);
  return [provider.name, ...extras];
}

/**
 * Reads one vendored skill as the set of files to write under the target's skills folder.
 *
 * Refuses a directory missing its licence or provenance rather than installing a copy whose
 * origin a reader could not establish.
 */
export async function readVendoredSkill(
  skillName: string,
  skillsFolder: string,
  vendorRoot: string = vendorSkillsRoot(),
): Promise<InstallableFile[]> {
  const origin = join(vendorRoot, skillName);
  if (!existsSync(origin)) {
    throw new InstallError(
      `${skillName}: not present in vendor/skills; run "pnpm vendor" before publishing`,
    );
  }

  const files = await filesUnder(origin);
  for (const required of REQUIRED) {
    if (!files.includes(required)) {
      throw new InstallError(
        `${skillName}: vendored copy has no ${required}; it may not be installed without it`,
      );
    }
  }

  return await Promise.all(
    files.map(async (file) => ({
      relativePath: join(skillsFolder, skillName, file),
      contents: await readFile(join(origin, file)),
    })),
  );
}

/** Reads every chosen provider as files to write, in a stable order. */
export async function readVendoredSkills(
  providers: readonly Provider[],
  chosenExtras: readonly string[] = [],
  skillsFolder = ".ai/skills",
  vendorRoot: string = vendorSkillsRoot(),
): Promise<InstallableFile[]> {
  const files: InstallableFile[] = [];
  for (const provider of providers) {
    for (const skill of skillDirectoriesFor(provider, chosenExtras)) {
      files.push(...(await readVendoredSkill(skill, skillsFolder, vendorRoot)));
    }
  }
  return files;
}

/** Authored content for a provider this repository does not vendor, such as a tool's usage skill. */
export function providerTemplatesRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "providers");
}

/**
 * Reads the local skill this repository wrote for a tool it does not vendor.
 *
 * A tool installed machine-wide contributes no upstream files, but a project still benefits
 * from a note saying how it is used here. That note is ours, so it carries no licence or
 * provenance of someone else's.
 */
export async function readLocalProviderSkill(
  provider: Provider,
  skillsFolder: string,
  templatesRoot: string = providerTemplatesRoot(),
): Promise<InstallableFile[]> {
  const origin = join(templatesRoot, provider.name);
  if (!existsSync(origin)) {
    throw new InstallError(
      `${provider.name}: vendors nothing and has no skill at templates/providers/${provider.name}`,
    );
  }

  return await Promise.all(
    (await filesUnder(origin)).map(async (file) => ({
      relativePath: join(skillsFolder, provider.name, file),
      contents: await readFile(join(origin, file)),
    })),
  );
}

/**
 * Whether a program is on `PATH`.
 *
 * Read from the environment rather than by spawning `which`, so the answer is the same on
 * every platform and a test can control it.
 */
export function hasBinary(name: string, environment: NodeJS.ProcessEnv = process.env): boolean {
  const windows = process.platform === "win32";
  const path = environment["PATH"] ?? environment["Path"] ?? "";
  if (path.length === 0) {
    return false;
  }

  const extensions = windows ? (environment["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";") : [""];

  return path
    .split(windows ? ";" : ":")
    .filter((directory) => directory.length > 0)
    .some((directory) => extensions.some((extension) => existsSync(join(directory, `${name}${extension}`))));
}

/** A tool that was chosen but whose program is not installed. */
export interface MissingBinary {
  readonly provider: string;
  readonly binary: string;
  readonly hint: string | undefined;
  readonly homepage: string;
}

/**
 * Reports the chosen tools whose program is not on `PATH`.
 *
 * The scaffold never installs a program. It says what is missing and where to get it, then
 * installs the local skill anyway, since scaffolding before installing tools is reasonable.
 */
export function missingBinaries(
  providers: readonly Provider[],
  environment: NodeJS.ProcessEnv = process.env,
): MissingBinary[] {
  return providers
    .filter((provider) => provider.requiresBinary && !hasBinary(provider.requiresBinary, environment))
    .map((provider) => ({
      provider: provider.name,
      binary: provider.requiresBinary as string,
      hint: provider.installHint,
      homepage: provider.homepage,
    }));
}

/**
 * The credit line for one provider, used in this repository's README.
 *
 * Deliberately states the licence next to the name: a reader deciding whether to install
 * something should not have to open a directory to learn whose work it is.
 */
export function creditLine(provider: Provider): string {
  return `| [\`${provider.name}\`](${provider.homepage}) | ${provider.summary} | ${provider.author} | ${provider.license} |`;
}

/** The credits table for every provider, newest concerns first: who wrote it, and under what. */
export function creditsTable(providers: readonly Provider[]): string {
  const header = ["| Provider | What it does | Author | Licence |", "| --- | --- | --- | --- |"];
  const rows = [...providers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(creditLine);
  return [...header, ...rows].join("\n");
}
