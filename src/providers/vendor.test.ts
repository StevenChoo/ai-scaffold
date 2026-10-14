/**
 * The vendored tree, checked against the manifest that claims to describe it.
 *
 * These read what is committed rather than fetching, so they run offline and fast. Proving
 * that a refetch still matches upstream is the job of `pnpm vendor:check` in CI.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

import { readManifest } from "./manifest.js";
import { fingerprint, repin, vendorRootFor } from "./vendor.js";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const vendorRoot = vendorRootFor(repositoryRoot);

/** Every directory name the manifest expects to find vendored. */
async function expectedSkills(): Promise<string[]> {
  const names: string[] = [];
  for (const provider of await readManifest()) {
    if (!provider.source) {
      continue;
    }
    names.push(provider.name, ...(provider.extras ?? []).map((extra) => extra.name));
  }
  return names;
}

describe("the vendored tree", () => {
  test("holds a directory for every provider the manifest vendors", async () => {
    for (const name of await expectedSkills()) {
      assert.ok(existsSync(join(vendorRoot, name)), `vendor/skills/${name} is missing; run pnpm vendor`);
    }
  });

  test("carries a licence with every copy, which redistribution depends on", async () => {
    for (const name of await expectedSkills()) {
      const licence = join(vendorRoot, name, "LICENSE");
      assert.ok(existsSync(licence), `${name} has no LICENSE; it may not be redistributed`);
      const text = await readFile(licence, "utf8");
      assert.match(text, /Copyright/i, `${name} has a LICENSE with no copyright notice`);
    }
  });

  test("carries a usable skill with every copy", async () => {
    for (const name of await expectedSkills()) {
      const skill = join(vendorRoot, name, "SKILL.md");
      assert.ok(existsSync(skill), `${name} has no SKILL.md`);
      assert.match(await readFile(skill, "utf8"), /^---/, `${name} has a SKILL.md without frontmatter`);
    }
  });

  test("states the pinned commit and the author beside each copy", async () => {
    for (const provider of await readManifest()) {
      if (!provider.source) {
        continue;
      }
      for (const name of [provider.name, ...(provider.extras ?? []).map((extra) => extra.name)]) {
        const note = await readFile(join(vendorRoot, name, "SOURCE.md"), "utf8");
        assert.ok(note.includes(provider.source.commit), `${name} does not state the pinned commit`);
        assert.ok(note.includes(provider.author), `${name} does not credit ${provider.author}`);
        assert.ok(note.includes(provider.homepage), `${name} does not link upstream`);
      }
    }
  });

  test("holds nothing the manifest does not claim", async () => {
    const { readdir } = await import("node:fs/promises");
    const claimed = new Set(await expectedSkills());
    for (const entry of await readdir(vendorRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        assert.ok(claimed.has(entry.name), `vendor/skills/${entry.name} has no provider and no licence trail`);
      }
    }
  });

  test("keeps a skill this repository wrote out of the vendored tree", async () => {
    for (const name of await expectedSkills()) {
      assert.equal(
        existsSync(join(repositoryRoot, "templates", ".ai", "skills", name)),
        false,
        `${name} is both vendored and authored here; one of the two is wrong`,
      );
    }
  });
});

describe("repin", () => {
  const manifest = {
    providers: [
      { name: "a", source: { repo: "x/a", ref: "main", commit: "1".repeat(40), path: ".", license: "LICENSE" } },
      { name: "b", source: { repo: "x/b", ref: "main", commit: "2".repeat(40), path: ".", license: "LICENSE" } },
      { name: "tool", requiresBinary: "tool" },
    ],
  };

  async function withManifest(run: (path: string) => Promise<void>): Promise<void> {
    const workspace = await mkdtemp(join(tmpdir(), "ai-scaffold-repin-"));
    const file = join(workspace, "providers.json");
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
      await run(file);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  const moved = (provider: string, latest: string) => ({
    provider,
    repo: "x/a",
    ref: "main",
    pinned: "1".repeat(40),
    latest,
    moved: true,
  });

  test("updates only the providers that moved", async () => {
    await withManifest(async (file) => {
      await repin(file, [moved("a", "9".repeat(40))]);

      const after = JSON.parse(await readFile(file, "utf8")) as typeof manifest;
      assert.equal(after.providers[0]?.source?.commit, "9".repeat(40));
      assert.equal(after.providers[1]?.source?.commit, "2".repeat(40), "b must not be touched");
    });
  });

  test("leaves a provider that vendors nothing alone", async () => {
    await withManifest(async (file) => {
      await repin(file, [moved("tool", "9".repeat(40))]);

      const after = JSON.parse(await readFile(file, "utf8")) as typeof manifest;
      assert.equal(after.providers[2]?.name, "tool");
      assert.ok(!("source" in (after.providers[2] ?? {})), "no source may be invented");
    });
  });

  test("writes a manifest that still parses and keeps its shape", async () => {
    await withManifest(async (file) => {
      await repin(file, [moved("a", "9".repeat(40))]);

      const text = await readFile(file, "utf8");
      assert.ok(text.endsWith("\n"), "the file must end with a newline");
      assert.equal((JSON.parse(text) as typeof manifest).providers.length, 3);
    });
  });

  test("changes nothing when nothing moved", async () => {
    await withManifest(async (file) => {
      const before = await readFile(file, "utf8");
      await repin(file, []);
      assert.equal(await readFile(file, "utf8"), before);
    });
  });
});

describe("fingerprint", () => {
  test("changes when a vendored file changes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai-scaffold-fp-"));
    try {
      const skill = join(workspace, "example");
      await mkdir(skill, { recursive: true });
      await writeFile(join(skill, "SKILL.md"), "original\n");

      const before = await fingerprint(skill);
      await writeFile(join(skill, "SKILL.md"), "edited\n");
      assert.notEqual(await fingerprint(skill), before);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("ignores SOURCE.md, which is generated rather than fetched", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai-scaffold-fp-"));
    try {
      const skill = join(workspace, "example");
      await mkdir(skill, { recursive: true });
      await writeFile(join(skill, "SKILL.md"), "content\n");

      const before = await fingerprint(skill);
      await writeFile(join(skill, "SOURCE.md"), "regenerated provenance\n");
      assert.equal(await fingerprint(skill), before, "a generated note must not mask an upstream change");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("is empty for a directory that is not there", async () => {
    assert.equal(await fingerprint(join(tmpdir(), "ai-scaffold-absent-directory")), "");
  });
});
