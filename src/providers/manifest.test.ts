/**
 * Validation of the provider manifest.
 *
 * A vendored copy carries someone else's licence, so an entry that misstates its origin is
 * worse than a missing one. Every case here is a way the manifest could lie.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ManifestError, parseManifest, providersOfKind, readManifest } from "./manifest.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function provider(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "example",
    kind: "skill",
    summary: "Does a thing",
    author: "Someone",
    license: "MIT",
    homepage: "https://example.invalid/example",
    source: {
      repo: "someone/example",
      ref: "main",
      commit: COMMIT,
      path: "skills/example",
      license: "LICENSE",
    },
    ...overrides,
  };
}

describe("the shipped manifest", () => {
  test("is valid", async () => {
    const providers = await readManifest();
    assert.ok(providers.length > 0, "the manifest must describe at least one provider");
  });

  test("pins every vendored provider to a full commit", async () => {
    for (const entry of await readManifest()) {
      if (entry.source) {
        assert.match(entry.source.commit, /^[0-9a-f]{40}$/, `${entry.name} is not pinned`);
      }
    }
  });

  test("credits an author and a licence for every provider", async () => {
    for (const entry of await readManifest()) {
      assert.ok(entry.author.length > 0, `${entry.name} has no author to credit`);
      assert.ok(entry.license.length > 0, `${entry.name} has no licence recorded`);
      assert.match(entry.homepage, /^https:\/\//, `${entry.name} has no upstream link`);
    }
  });

  test("keeps menu summaries short enough to scan", async () => {
    for (const entry of await readManifest()) {
      const words = entry.summary.split(/\s+/).length;
      assert.ok(words <= 6, `${entry.name} has a ${words}-word summary; the menu needs a few words`);
    }
  });

  test("offers both a skill and a tool", async () => {
    const providers = await readManifest();
    assert.ok(providersOfKind(providers, "skill").length > 0);
    assert.ok(providersOfKind(providers, "tool").length > 0);
  });
});

describe("parseManifest", () => {
  test("accepts a well-formed entry", () => {
    const [parsed] = parseManifest({ providers: [provider()] });
    assert.equal(parsed?.name, "example");
    assert.equal(parsed?.source?.commit, COMMIT);
  });

  test("rejects a manifest without a providers list", () => {
    assert.throws(() => parseManifest({}), ManifestError);
    assert.throws(() => parseManifest({ providers: "no" }), ManifestError);
  });

  test("rejects a branch or short sha in place of a pinned commit", () => {
    for (const commit of ["main", "0123456", "", "not-a-sha"]) {
      assert.throws(
        () => parseManifest({ providers: [provider({ source: { repo: "a/b", ref: "main", commit, path: ".", license: "LICENSE" } })] }),
        ManifestError,
        `expected ${JSON.stringify(commit)} to be rejected`,
      );
    }
  });

  test("rejects a repository that is not owner/name", () => {
    assert.throws(
      () => parseManifest({ providers: [provider({ source: { repo: "https://github.com/a/b", ref: "main", commit: COMMIT, path: ".", license: "LICENSE" } })] }),
      ManifestError,
    );
  });

  test("rejects a provider that installs nothing", () => {
    assert.throws(() => parseManifest({ providers: [provider({ source: undefined })] }), ManifestError);
  });

  test("accepts a tool that only checks for a binary", () => {
    const [parsed] = parseManifest({
      providers: [provider({ kind: "tool", source: undefined, requiresBinary: "rtk" })],
    });
    assert.equal(parsed?.requiresBinary, "rtk");
    assert.equal(parsed?.source, undefined);
  });

  test("rejects extras with nothing to take them from", () => {
    assert.throws(
      () => parseManifest({ providers: [provider({ source: undefined, requiresBinary: "x", extras: [{ name: "e", summary: "s", path: "p" }] })] }),
      ManifestError,
    );
  });

  test("rejects a kind that is neither skill nor tool", () => {
    assert.throws(() => parseManifest({ providers: [provider({ kind: "plugin" })] }), ManifestError);
  });

  test("rejects a name used twice, including by an extra", () => {
    assert.throws(
      () => parseManifest({ providers: [provider(), provider()] }),
      ManifestError,
    );
    assert.throws(
      () => parseManifest({ providers: [provider({ extras: [{ name: "example", summary: "s", path: "p" }] })] }),
      ManifestError,
    );
  });

  test("names the offending provider in the message", () => {
    assert.throws(
      () => parseManifest({ providers: [provider({ name: "humanizer", summary: "" })] }),
      /humanizer/,
      "a build failure must say which provider is at fault",
    );
  });

  test("falls back to an index when the entry has no usable name", () => {
    assert.throws(() => parseManifest({ providers: [{}] }), /index 0/);
  });
});
