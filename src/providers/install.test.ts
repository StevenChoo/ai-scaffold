/**
 * Installing a vendored skill into a scaffolded project.
 *
 * The rule these enforce is simple: a copy of someone else's work travels whole, with the
 * licence that permits the copy and the note saying where it came from, or it does not travel.
 */

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { readManifest } from "./manifest.js";
import type { Provider } from "./manifest.js";
import {
  InstallError,
  creditsTable,
  hasBinary,
  missingBinaries,
  readLocalProviderSkill,
  readVendoredSkill,
  readVendoredSkills,
  skillDirectoriesFor,
} from "./install.js";

/** A vendored directory with only the files named, so omissions can be tested. */
async function fakeVendor(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ai-scaffold-vendor-test-"));
  await mkdir(join(root, "example"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, "example", name), content);
  }
  return root;
}

const COMPLETE = {
  "SKILL.md": "---\nname: example\ndescription: Does a thing.\n---\n",
  LICENSE: "MIT License\n\nCopyright (c) 2026 Someone\n",
  "SOURCE.md": "# Source\n",
};

describe("readVendoredSkill", () => {
  test("returns every file, placed under the skills folder", async () => {
    const root = await fakeVendor(COMPLETE);
    try {
      const files = await readVendoredSkill("example", ".ai/skills", root);
      assert.deepEqual(
        files.map((file) => file.relativePath).sort(),
        [".ai/skills/example/LICENSE", ".ai/skills/example/SKILL.md", ".ai/skills/example/SOURCE.md"],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("honours a renamed AI folder", async () => {
    const root = await fakeVendor(COMPLETE);
    try {
      const files = await readVendoredSkill("example", ".agent/skills", root);
      assert.ok(files.every((file) => file.relativePath.startsWith(".agent/skills/example/")));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses a copy with no licence, which may not be redistributed", async () => {
    const root = await fakeVendor({ "SKILL.md": COMPLETE["SKILL.md"], "SOURCE.md": "# Source\n" });
    try {
      await assert.rejects(() => readVendoredSkill("example", ".ai/skills", root), InstallError);
      await assert.rejects(() => readVendoredSkill("example", ".ai/skills", root), /LICENSE/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses a copy with no provenance", async () => {
    const root = await fakeVendor({ "SKILL.md": COMPLETE["SKILL.md"], LICENSE: COMPLETE.LICENSE });
    try {
      await assert.rejects(() => readVendoredSkill("example", ".ai/skills", root), /SOURCE\.md/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses a directory that is not vendored at all", async () => {
    const root = await fakeVendor(COMPLETE);
    try {
      await assert.rejects(() => readVendoredSkill("absent", ".ai/skills", root), /pnpm vendor/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("skillDirectoriesFor", () => {
  const provider = (overrides: Partial<Provider>): Provider =>
    ({
      name: "ponytail",
      kind: "tool",
      summary: "Writes less code",
      author: "Someone",
      license: "MIT",
      homepage: "https://example.invalid",
      source: {
        repo: "a/b",
        ref: "main",
        commit: "0".repeat(40),
        path: "skills/ponytail",
        license: "LICENSE",
      },
      extras: [
        { name: "ponytail-review", summary: "Reviews", path: "skills/ponytail-review" },
        { name: "ponytail-audit", summary: "Audits", path: "skills/ponytail-audit" },
      ],
      ...overrides,
    }) as Provider;

  test("installs the core skill and no extras by default", () => {
    assert.deepEqual(skillDirectoriesFor(provider({})), ["ponytail"]);
  });

  test("adds only the extras that were chosen", () => {
    assert.deepEqual(skillDirectoriesFor(provider({}), ["ponytail-audit"]), ["ponytail", "ponytail-audit"]);
  });

  test("ignores an extra name the provider does not offer", () => {
    assert.deepEqual(skillDirectoriesFor(provider({}), ["something-else"]), ["ponytail"]);
  });

  test("contributes no directory for a provider that vendors nothing", () => {
    assert.deepEqual(skillDirectoriesFor(provider({ source: undefined, extras: undefined })), []);
  });
});

describe("hasBinary", () => {
  test("finds a program that is on PATH", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-scaffold-bin-"));
    try {
      await writeFile(join(root, "pretend-tool"), "#!/bin/sh\n");
      assert.equal(hasBinary("pretend-tool", { PATH: root }), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not find a program that is not", () => {
    assert.equal(hasBinary("definitely-not-installed", { PATH: "/nonexistent" }), false);
  });

  test("searches every entry on PATH", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-scaffold-bin-"));
    try {
      await writeFile(join(root, "pretend-tool"), "#!/bin/sh\n");
      assert.equal(hasBinary("pretend-tool", { PATH: `/nonexistent:${root}` }), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reports nothing found when PATH is empty", () => {
    assert.equal(hasBinary("node", { PATH: "" }), false);
    assert.equal(hasBinary("node", {}), false);
  });
});

describe("missingBinaries", () => {
  test("reports a chosen tool whose program is absent, with a way to get it", async () => {
    const tools = (await readManifest()).filter((provider) => provider.requiresBinary);
    assert.ok(tools.length > 0, "expected at least one tool needing a binary");

    const missing = missingBinaries(tools, { PATH: "/nonexistent" });
    assert.equal(missing.length, tools.length);
    for (const entry of missing) {
      assert.ok(entry.hint ?? entry.homepage, `${entry.provider} says nothing about how to install it`);
    }
  });

  test("reports nothing when the program is there", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-scaffold-bin-"));
    try {
      const tools = (await readManifest()).filter((provider) => provider.requiresBinary);
      for (const tool of tools) {
        await writeFile(join(root, tool.requiresBinary as string), "#!/bin/sh\n");
      }
      assert.deepEqual(missingBinaries(tools, { PATH: root }), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("ignores a provider that needs no program", async () => {
    const skills = (await readManifest()).filter((provider) => !provider.requiresBinary);
    assert.deepEqual(missingBinaries(skills, { PATH: "/nonexistent" }), []);
  });
});

describe("readLocalProviderSkill", () => {
  test("reads the skill this repository wrote for every tool that vendors nothing", async () => {
    for (const provider of await readManifest()) {
      if (provider.source || !provider.requiresBinary) {
        continue;
      }
      const files = await readLocalProviderSkill(provider, ".ai/skills");
      assert.ok(
        files.some((file) => file.relativePath === `.ai/skills/${provider.name}/SKILL.md`),
        `${provider.name} has no local SKILL.md`,
      );
    }
  });

  test("carries no licence or provenance, because the skill is ours", async () => {
    const provider = (await readManifest()).find((entry) => !entry.source && entry.requiresBinary);
    assert.ok(provider, "expected a tool that vendors nothing");

    const names = (await readLocalProviderSkill(provider, ".ai/skills")).map((file) => file.relativePath);
    assert.ok(!names.some((name) => name.endsWith("/SOURCE.md")), "our own skill must not claim a source");
  });
});

describe("credits", () => {
  test("names every provider, its author and its licence", async () => {
    const providers = await readManifest();
    const table = creditsTable(providers);
    for (const provider of providers) {
      assert.ok(table.includes(provider.name), `${provider.name} is not credited`);
      assert.ok(table.includes(provider.author), `${provider.author} is not credited`);
      assert.ok(table.includes(provider.license), `${provider.name} has no licence in the credits`);
      assert.ok(table.includes(provider.homepage), `${provider.name} has no upstream link`);
    }
  });

  test("credits a tool that vendors nothing but is still referenced", async () => {
    const providers = await readManifest();
    const unvendored = providers.filter((provider) => !provider.source);
    assert.ok(unvendored.length > 0, "expected at least one provider with no vendored content");
    for (const provider of unvendored) {
      assert.ok(creditsTable(providers).includes(provider.name));
    }
  });
});

describe("installing from the shipped vendor tree", () => {
  test("every vendored provider installs as a complete, attributed copy", async () => {
    const providers = (await readManifest()).filter((provider) => provider.source);
    const files = await readVendoredSkills(providers, []);

    for (const provider of providers) {
      const prefix = `.ai/skills/${provider.name}/`;
      const mine = files.filter((file) => file.relativePath.startsWith(prefix));
      assert.ok(mine.length >= 3, `${provider.name} installed ${mine.length} files`);

      const licence = mine.find((file) => file.relativePath === `${prefix}LICENSE`);
      assert.ok(licence, `${provider.name} would install without its licence`);
      assert.match(licence.contents.toString("utf8"), /Copyright/i);

      const note = mine.find((file) => file.relativePath === `${prefix}SOURCE.md`);
      assert.ok(note?.contents.toString("utf8").includes(provider.author), `${provider.name} loses its credit`);
    }
  });
});
