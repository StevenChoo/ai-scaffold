#!/usr/bin/env node

/**
 * `pnpm vendor` — refresh `vendor/` from the commits pinned in `providers.json`.
 *
 * With `--check` it vendors into a temporary directory and compares, so continuous
 * integration can prove that what is committed is what the manifest describes. Drift fails
 * loudly: a stored copy that no longer matches its pin has a `SOURCE.md` and a `LICENSE`
 * describing content that is not there, which is worse than a broken build.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import process from "node:process";

import { readFile, writeFile } from "node:fs/promises";

import { replaceRegion } from "../scaffold/reindex.js";
import { ManifestError, readManifest } from "./manifest.js";
import { creditsTable } from "./install.js";
import { VendorError, fingerprint, refStates, repin, vendorAll, vendorRootFor } from "./vendor.js";
import { manifestPath } from "./manifest.js";

/**
 * Rewrites the credits table from the manifest.
 *
 * Credit is a licence obligation, so it may not depend on someone remembering to edit a
 * table. Returns the README text, whether or not it changed.
 */
async function renderCredits(readmePath: string, table: string): Promise<string> {
  const original = await readFile(readmePath, "utf8");
  return replaceRegion(original, "credits", table);
}

const USAGE = `vendor — copy external skills into vendor/ from their pinned commits

Usage:
  pnpm vendor              Refresh vendor/ from the commits pinned in providers.json
  pnpm vendor --check      Verify vendor/ matches providers.json, writing nothing
  pnpm vendor --update     Follow each provider's ref, repin to the newest commit, re-vendor
  pnpm vendor --outdated   Report which providers have moved on, changing nothing
  pnpm vendor --help       Show this message

Run --update before a release so a published package carries current skills. Review the diff:
upstream content is someone else's, and an update can change what a skill tells an agent to do.
`;

async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }

  const check = argv.includes("--check");
  const update = argv.includes("--update");
  const outdated = argv.includes("--outdated");
  const unknown = argv.filter(
    (argument) => !["--check", "--update", "--outdated"].includes(argument),
  );
  if (unknown.length > 0) {
    process.stderr.write(`vendor: unknown option ${JSON.stringify(unknown[0])}\n\n${USAGE}`);
    return 2;
  }
  if ([check, update, outdated].filter(Boolean).length > 1) {
    process.stderr.write(`vendor: --check, --update and --outdated cannot be combined\n\n${USAGE}`);
    return 2;
  }

  const repositoryRoot = process.cwd();
  const providers = await readManifest();
  const stored = vendorRootFor(repositoryRoot);

  if (outdated || update) {
    const states = await refStates(providers);
    const moved = states.filter((state) => state.moved);

    for (const state of states) {
      const status = state.moved ? `${state.pinned.slice(0, 7)} -> ${state.latest.slice(0, 7)}` : "current";
      process.stdout.write(`  ${state.provider.padEnd(24)} ${state.ref.padEnd(8)} ${status}\n`);
    }

    if (moved.length === 0) {
      process.stdout.write(`\nevery provider is pinned to the newest commit on its ref\n`);
      return 0;
    }

    if (!update) {
      process.stdout.write(`\n${moved.length} provider(s) have moved on; run "pnpm vendor:update" to repin\n`);
      return 0;
    }

    await repin(manifestPath(), moved);
    process.stdout.write(`\nrepinned ${moved.length} provider(s); re-vendoring\n`);
    // Fall through so the copies match the pins that were just written.
  }

  const readmePath = join(repositoryRoot, "README.md");
  const credits = await renderCredits(readmePath, creditsTable(providers));

  if (update) {
    const refreshed = await vendorAll(await readManifest(), { vendorRoot: stored });
    await writeFile(readmePath, await renderCredits(readmePath, creditsTable(await readManifest())));
    process.stdout.write(
      `\nvendored ${refreshed.length} skill(s); review the diff before committing\n`,
    );
    return 0;
  }

  if (!check) {
    if (credits !== (await readFile(readmePath, "utf8"))) {
      await writeFile(readmePath, credits);
      process.stdout.write("  credited  README.md\n");
    }
    const written = await vendorAll(providers, { vendorRoot: stored });
    for (const skill of written) {
      process.stdout.write(`  vendored  ${relative(repositoryRoot, join(stored, skill.name))} (${skill.files.length} files)\n`);
    }
    process.stdout.write(`\nvendored ${written.length} skill(s) from ${providers.length} provider(s)\n`);
    return 0;
  }

  const workspace = await mkdtemp(join(tmpdir(), "ai-scaffold-check-"));
  try {
    const fresh = await vendorAll(providers, { vendorRoot: workspace });
    const drifted: string[] = [];

    for (const skill of fresh) {
      const [expected, actual] = await Promise.all([
        fingerprint(join(workspace, skill.name)),
        fingerprint(join(stored, skill.name)),
      ]);
      if (actual === "") {
        drifted.push(`  ${skill.name}: missing from vendor/, but providers.json describes it`);
      } else if (expected !== actual) {
        drifted.push(`  ${skill.name}: differs from its pinned commit`);
      }
    }

    if (credits !== (await readFile(readmePath, "utf8"))) {
      drifted.push("  README.md: the credits table does not match providers.json");
    }

    const vendored = new Set(fresh.map((skill) => skill.name));
    for (const provider of providers) {
      for (const name of [provider.name, ...(provider.extras ?? []).map((extra) => extra.name)]) {
        vendored.add(name);
      }
    }
    // A directory nobody claims has no licence trail we can vouch for.
    const { readdir } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    if (existsSync(stored)) {
      for (const entry of await readdir(stored, { withFileTypes: true })) {
        if (entry.isDirectory() && !vendored.has(entry.name)) {
          drifted.push(`  ${entry.name}: in vendor/, but no provider claims it`);
        }
      }
    }

    if (drifted.length > 0) {
      process.stderr.write(
        `vendor: vendor/ does not match providers.json\n\n${drifted.join("\n")}\n\n` +
          `Run "pnpm vendor" and commit the result.\n`,
      );
      return 1;
    }

    process.stdout.write(`vendor: ${fresh.length} skill(s) match providers.json\n`);
    return 0;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof VendorError || error instanceof ManifestError) {
    process.stderr.write(`vendor: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`vendor: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
