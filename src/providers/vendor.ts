/**
 * Copies external skills into `vendor/`, from the commits the manifest pins.
 *
 * Upstream skills disappear: repositories are renamed, skills are deleted, accounts go quiet.
 * A copy taken at a known commit and kept in this repository is what makes a scaffold work a
 * year later. That copy carries someone else's licence, so fetching is deliberately strict:
 * anything that would produce a copy whose provenance we cannot state stops the run.
 *
 * There is one fetcher, not one per source. The only thing that varies between providers is
 * where the skill sits inside its repository, which is a field in the manifest.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import type { Provider, ProviderSource } from "./manifest.js";

const run = promisify(execFile);

/** Raised when a provider cannot be vendored. Always names the provider and what went wrong. */
export class VendorError extends Error {
  override readonly name = "VendorError";
}

/** One vendored directory, as written. */
export interface VendoredSkill {
  readonly name: string;
  readonly files: readonly string[];
}

/** Where an extracted upstream archive is, and which commit it holds. */
interface Checkout {
  readonly root: string;
  readonly commit: string;
}

function archiveUrl(repo: string, commit: string): string {
  return `https://codeload.github.com/${repo}/tar.gz/${commit}`;
}

/**
 * Downloads and unpacks one repository at one commit.
 *
 * The tarball endpoint needs no git and no credentials for a public repository, and a commit
 * URL is immutable, so the same call always yields the same bytes.
 */
async function checkout(source: ProviderSource, workspace: string, provider: string): Promise<Checkout> {
  const url = archiveUrl(source.repo, source.commit);

  let body: ArrayBuffer;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new VendorError(
        `${provider}: ${source.repo} has no commit ${source.commit} (${response.status} from ${url}). ` +
          `If upstream rewrote history, update "commit" in providers.json.`,
      );
    }
    body = await response.arrayBuffer();
  } catch (error) {
    if (error instanceof VendorError) {
      throw error;
    }
    throw new VendorError(`${provider}: could not download ${url}: ${(error as Error).message}`);
  }

  const archive = join(workspace, "archive.tar.gz");
  await writeFile(archive, Buffer.from(body));

  const root = join(workspace, "extracted");
  await mkdir(root, { recursive: true });
  try {
    await run("tar", ["-xzf", archive, "-C", root, "--strip-components=1"]);
  } catch (error) {
    throw new VendorError(`${provider}: could not unpack ${source.repo}: ${(error as Error).message}`);
  }

  return { root, commit: source.commit };
}

/** Every file below a directory, as paths relative to it, sorted for a stable comparison. */
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

/** The provenance note that travels with a copy, so its origin is stated where the copy is. */
function sourceNote(provider: Provider, source: ProviderSource, skill: string, subpath: string): string {
  return `# Source

This directory is a copy. It was not written for this repository and is not maintained here.

| | |
| --- | --- |
| Skill | \`${skill}\` |
| Upstream | ${provider.homepage} |
| Repository | \`${source.repo}\` |
| Commit | \`${source.commit}\` |
| Path | \`${subpath === "" ? "." : subpath}\` |
| Author | ${provider.author} |
| Licence | ${provider.license}, reproduced in [\`LICENSE\`](LICENSE) |

Do not edit these files. They are replaced wholesale from the commit above whenever ai-scaffold
refreshes them: by \`ai-scaffold init . --fresh\` in a project that uses it, and by \`pnpm vendor\`
in the ai-scaffold repository. Report problems upstream.
`;
}

/** Copies one directory out of a checkout, applying an include filter when the manifest sets one. */
async function copySkill(
  from: string,
  to: string,
  include: readonly string[] | undefined,
  provider: string,
): Promise<void> {
  if (!existsSync(from)) {
    throw new VendorError(
      `${provider}: ${relative(dirname(from), from)} is not in the archive; check "path" in providers.json`,
    );
  }

  await rm(to, { recursive: true, force: true });
  await mkdir(to, { recursive: true });

  if (include) {
    // A repository whose root is the skill would otherwise drag in its whole tree.
    for (const entry of include) {
      const origin = join(from, entry);
      if (!existsSync(origin)) {
        throw new VendorError(`${provider}: "include" names ${entry}, which is not in the archive`);
      }
      await mkdir(dirname(join(to, entry)), { recursive: true });
      await cp(origin, join(to, entry), { recursive: true });
    }
    return;
  }

  await cp(from, to, { recursive: true });
}

/** Writes one skill directory: the upstream files, its licence, and where it came from. */
async function writeSkill(
  provider: Provider,
  source: ProviderSource,
  checkedOut: Checkout,
  skillName: string,
  subpath: string,
  include: readonly string[] | undefined,
  vendorRoot: string,
): Promise<VendoredSkill> {
  const destination = join(vendorRoot, skillName);
  await copySkill(join(checkedOut.root, subpath), destination, include, provider.name);

  if (!existsSync(join(destination, "SKILL.md"))) {
    throw new VendorError(
      `${provider.name}: no SKILL.md under ${subpath}; the manifest points at something that is not a skill`,
    );
  }

  // Redistribution under MIT and Apache-2.0 is conditional on the licence travelling with the
  // copy, so a missing licence file is a hard failure rather than a warning.
  const licence = join(checkedOut.root, source.license);
  if (!existsSync(licence)) {
    throw new VendorError(
      `${provider.name}: no licence at ${source.license} in ${source.repo}; a copy may not be redistributed without it`,
    );
  }
  await cp(licence, join(destination, "LICENSE"));
  await writeFile(join(destination, "SOURCE.md"), sourceNote(provider, source, skillName, subpath));

  return { name: skillName, files: await filesUnder(destination) };
}

export interface VendorOptions {
  /** Directory that holds vendored skills. Defaults to `vendor/skills` beside the manifest. */
  readonly vendorRoot: string;
  /** Include the extras a provider bundles. They are vendored so the advanced flow can offer them. */
  readonly includeExtras?: boolean | undefined;
}

/** Vendors one provider, plus its extras, from a single download. */
export async function vendorProvider(
  provider: Provider,
  options: VendorOptions,
): Promise<VendoredSkill[]> {
  const { source } = provider;
  if (!source) {
    return []; // A tool that only checks for a binary has nothing to copy.
  }

  const workspace = await mkdtemp(join(tmpdir(), "ai-scaffold-vendor-"));
  try {
    const checkedOut = await checkout(source, workspace, provider.name);
    const written = [
      await writeSkill(
        provider,
        source,
        checkedOut,
        provider.name,
        source.path === "." ? "" : source.path,
        source.include,
        options.vendorRoot,
      ),
    ];

    if (options.includeExtras !== false) {
      for (const extra of provider.extras ?? []) {
        written.push(
          await writeSkill(provider, source, checkedOut, extra.name, extra.path, undefined, options.vendorRoot),
        );
      }
    }

    return written;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

/** Vendors every provider that has a source. */
export async function vendorAll(
  providers: readonly Provider[],
  options: VendorOptions,
): Promise<VendoredSkill[]> {
  const written: VendoredSkill[] = [];
  for (const provider of providers) {
    written.push(...(await vendorProvider(provider, options)));
  }
  return written;
}

/** A content fingerprint of a directory, used to tell a refreshed copy from the stored one. */
export async function fingerprint(root: string): Promise<string> {
  if (!existsSync(root)) {
    return "";
  }
  const hash = createHash("sha256");
  for (const file of await filesUnder(root)) {
    // SOURCE.md is generated from the manifest, so it would mask a real upstream change.
    if (file === "SOURCE.md") {
      continue;
    }
    hash.update(file);
    hash.update(await readFile(join(root, file)));
  }
  return hash.digest("hex");
}

/** The commit a ref points at now, and whether it has moved since the manifest was pinned. */
export interface RefState {
  readonly provider: string;
  readonly repo: string;
  readonly ref: string;
  readonly pinned: string;
  readonly latest: string;
  readonly moved: boolean;
}

/**
 * Asks GitHub what a provider's tracked ref points at now.
 *
 * Unauthenticated requests are rate limited, so a refusal is reported as itself rather than
 * mistaken for a deleted repository: telling a developer their upstream is gone when it is
 * merely rate limited would send them looking for the wrong problem.
 */
export async function latestCommit(provider: Provider): Promise<RefState> {
  const { source } = provider;
  if (!source) {
    throw new VendorError(`${provider.name}: vendors nothing, so it has no ref to follow`);
  }

  const url = `https://api.github.com/repos/${source.repo}/commits/${source.ref}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  } catch (error) {
    throw new VendorError(`${provider.name}: could not reach ${url}: ${(error as Error).message}`);
  }

  if (response.status === 403 || response.status === 429) {
    throw new VendorError(
      `${provider.name}: GitHub rate limited the request for ${source.repo}. ` +
        `Set GITHUB_TOKEN or try again later; the pinned copy is unaffected.`,
    );
  }
  if (response.status === 404) {
    throw new VendorError(
      `${provider.name}: ${source.repo} has no ref ${JSON.stringify(source.ref)}. ` +
        `Upstream may have renamed or deleted it. The vendored copy still works; update "ref" or drop the provider.`,
    );
  }
  if (!response.ok) {
    throw new VendorError(`${provider.name}: GitHub answered ${response.status} for ${source.repo}`);
  }

  const body = (await response.json()) as { sha?: unknown };
  if (typeof body.sha !== "string") {
    throw new VendorError(`${provider.name}: GitHub returned no commit sha for ${source.repo}`);
  }

  return {
    provider: provider.name,
    repo: source.repo,
    ref: source.ref,
    pinned: source.commit,
    latest: body.sha,
    moved: body.sha !== source.commit,
  };
}

/** Follows every provider's ref, reporting which ones have moved on. */
export async function refStates(providers: readonly Provider[]): Promise<RefState[]> {
  const states: RefState[] = [];
  for (const provider of providers) {
    if (provider.source) {
      states.push(await latestCommit(provider));
    }
  }
  return states;
}

/** Rewrites the pinned commits in a manifest file, leaving everything else as it was. */
export async function repin(manifestFile: string, moved: readonly RefState[]): Promise<void> {
  const raw = JSON.parse(await readFile(manifestFile, "utf8")) as {
    providers: { name: string; source?: { commit: string } }[];
  };

  for (const state of moved) {
    const entry = raw.providers.find((provider) => provider.name === state.provider);
    if (entry?.source) {
      entry.source.commit = state.latest;
    }
  }

  await writeFile(manifestFile, `${JSON.stringify(raw, null, 2)}\n`);
}

/** The default vendor directory for a repository root. */
export function vendorRootFor(repositoryRoot: string): string {
  return resolve(repositoryRoot, "vendor", "skills");
}
