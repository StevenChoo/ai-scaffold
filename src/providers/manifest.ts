/**
 * The catalogue of external skills and tools this scaffold can install.
 *
 * Everything that varies between providers is data in `providers.json`: where the content
 * lives upstream, which commit it was taken from, who wrote it, and the few words that
 * describe it in a menu. Adding a provider is an entry in that file, not a new script.
 *
 * The manifest is validated rather than trusted. A vendored copy carries someone else's
 * licence and provenance, so a malformed entry has to stop the build with a clear reason
 * instead of producing a copy that misstates where it came from.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Which menu a provider appears in. The label a developer recognises, not the mechanism. */
export type ProviderKind = "skill" | "tool";

/** Where a vendored copy came from, pinned so a refresh is reproducible. */
export interface ProviderSource {
  /** Upstream repository as `owner/name`. */
  readonly repo: string;
  /** The branch or tag a refresh follows when looking for a newer commit. */
  readonly ref: string;
  /** The exact commit the vendored copy was taken from. A ref alone is not reproducible. */
  readonly commit: string;
  /** Directory inside the repository holding the skill, or `.` when the repository is one. */
  readonly path: string;
  /** Path inside the repository to the licence text that must travel with the copy. */
  readonly license: string;
  /** When `path` is a whole repository, the only entries worth vendoring from it. */
  readonly include?: readonly string[] | undefined;
}

/** A further skill a provider bundles, offered only through the advanced options flow. */
export interface ProviderExtra {
  readonly name: string;
  readonly summary: string;
  /** Directory inside the same upstream repository, at the provider's pinned commit. */
  readonly path: string;
}

/** One installable external skill or tool. */
export interface Provider {
  /** Directory name under `vendor/`, and under the scaffolded skills folder. */
  readonly name: string;
  readonly kind: ProviderKind;
  /** A few words for the menu. Deliberately not the upstream description, which is trigger
   * text written for an agent to match against rather than for a person to read. */
  readonly summary: string;
  /** Credited in this repository's README and in the vendored `SOURCE.md`. */
  readonly author: string;
  /** SPDX identifier of the upstream licence. */
  readonly license: string;
  readonly homepage: string;
  /** Absent for a provider that vendors nothing, such as a tool installed separately. */
  readonly source?: ProviderSource | undefined;
  /**
   * A program that must already be on `PATH`. The scaffold checks for it and writes a local
   * skill describing how this project uses it. It never installs the program itself.
   */
  readonly requiresBinary?: string | undefined;
  /** How to get that program, shown when it is missing. */
  readonly installHint?: string | undefined;
  /** Extra skills bundled with this provider, none of them installed by default. */
  readonly extras?: readonly ProviderExtra[] | undefined;
}

/** Raised when the manifest cannot be trusted. Reported with the entry that is at fault. */
export class ManifestError extends Error {
  override readonly name = "ManifestError";
}

function fail(where: string, problem: string): never {
  throw new ManifestError(`providers.json: ${where} ${problem}`);
}

function requireString(value: unknown, where: string, field: string): string {
  const found: unknown = (value as Record<string, unknown>)[field];
  if (typeof found !== "string" || found.trim().length === 0) {
    fail(where, `needs a non-empty "${field}"`);
  }
  return found;
}

function optionalStrings(value: unknown, where: string, field: string): string[] | undefined {
  const found: unknown = (value as Record<string, unknown>)[field];
  if (found === undefined) {
    return undefined;
  }
  if (!Array.isArray(found) || found.some((entry) => typeof entry !== "string")) {
    fail(where, `has a "${field}" that is not a list of strings`);
  }
  return found as string[];
}

const COMMIT = /^[0-9a-f]{40}$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;

function parseSource(raw: unknown, where: string): ProviderSource {
  if (typeof raw !== "object" || raw === null) {
    fail(where, 'has a "source" that is not an object');
  }

  const repo = requireString(raw, where, "repo");
  if (!REPO.test(repo)) {
    fail(where, `has a "source.repo" that is not owner/name: ${JSON.stringify(repo)}`);
  }

  const commit = requireString(raw, where, "commit");
  if (!COMMIT.test(commit)) {
    // A branch moves. Vendored content that claims a branch cannot be verified later.
    fail(where, `has a "source.commit" that is not a full 40-character SHA: ${JSON.stringify(commit)}`);
  }

  return {
    repo,
    ref: requireString(raw, where, "ref"),
    commit,
    path: requireString(raw, where, "path"),
    license: requireString(raw, where, "license"),
    include: optionalStrings(raw, where, "include"),
  };
}

function parseExtras(raw: unknown, where: string): ProviderExtra[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    fail(where, 'has an "extras" that is not a list');
  }
  return raw.map((entry, index) => {
    const at = `${where} extras[${index}]`;
    if (typeof entry !== "object" || entry === null) {
      fail(at, "is not an object");
    }
    return {
      name: requireString(entry, at, "name"),
      summary: requireString(entry, at, "summary"),
      path: requireString(entry, at, "path"),
    };
  });
}

/** Validates one entry, naming the provider rather than an array index where it can. */
export function parseProvider(raw: unknown, index: number): Provider {
  const where = typeof raw === "object" && raw !== null && typeof (raw as { name?: unknown }).name === "string"
    ? `provider ${JSON.stringify((raw as { name: string }).name)}`
    : `provider at index ${index}`;

  if (typeof raw !== "object" || raw === null) {
    fail(where, "is not an object");
  }

  const record = raw as Record<string, unknown>;
  const kind = requireString(record, where, "kind");
  if (kind !== "skill" && kind !== "tool") {
    fail(where, `has a "kind" that is neither skill nor tool: ${JSON.stringify(kind)}`);
  }

  const source = record["source"] === undefined ? undefined : parseSource(record["source"], where);
  const requiresBinary = record["requiresBinary"];
  if (requiresBinary !== undefined && typeof requiresBinary !== "string") {
    fail(where, 'has a "requiresBinary" that is not a string');
  }
  if (source === undefined && requiresBinary === undefined) {
    // Otherwise the provider installs nothing and offering it would be a dead menu entry.
    fail(where, 'needs either a "source" to vendor from or a "requiresBinary" to check for');
  }

  const extras = parseExtras(record["extras"], where);
  if (extras !== undefined && source === undefined) {
    fail(where, 'has "extras" but no "source" to take them from');
  }

  return {
    name: requireString(record, where, "name"),
    kind,
    summary: requireString(record, where, "summary"),
    author: requireString(record, where, "author"),
    license: requireString(record, where, "license"),
    homepage: requireString(record, where, "homepage"),
    source,
    requiresBinary: requiresBinary as string | undefined,
    installHint: record["installHint"] === undefined ? undefined : requireString(record, where, "installHint"),
    extras,
  };
}

/** Validates a whole manifest, rejecting duplicate names that would collide on disk. */
export function parseManifest(raw: unknown): Provider[] {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { providers?: unknown }).providers)) {
    throw new ManifestError('providers.json: needs a top-level "providers" list');
  }

  const providers = (raw as { providers: unknown[] }).providers.map(parseProvider);

  const seen = new Set<string>();
  for (const provider of providers) {
    for (const name of [provider.name, ...(provider.extras ?? []).map((extra) => extra.name)]) {
      if (seen.has(name)) {
        throw new ManifestError(
          `providers.json: ${JSON.stringify(name)} appears twice; each name is a directory and must be unique`,
        );
      }
      seen.add(name);
    }
  }

  return providers;
}

/** The manifest shipped with this package. */
export function manifestPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "providers.json");
}

/** Reads and validates the shipped manifest. */
export async function readManifest(path: string = manifestPath()): Promise<Provider[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new ManifestError(`providers.json: could not be read as JSON: ${(error as Error).message}`);
  }
  return parseManifest(parsed);
}

/** Providers of one kind, in the order the menu should offer them. */
export function providersOfKind(providers: readonly Provider[], kind: ProviderKind): Provider[] {
  return providers.filter((provider) => provider.kind === kind);
}
