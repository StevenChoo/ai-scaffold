/**
 * Toolchain detection, against temporary repository roots only.
 *
 * Every case asserts what a file proves and nothing more, because a generated region that
 * states a guess is worse than one that states nothing.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { detectToolchain, renderToolchain } from "./toolchain.js";

/** Runs a case against a root holding the given files. */
async function withRoot<T>(files: Record<string, string>, run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "ai-scaffold-toolchain-"));
  try {
    for (const [name, contents] of Object.entries(files)) {
      await writeFile(join(root, name), contents, "utf8");
    }
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("detectToolchain", () => {
  test("prefers a pinned package manager over a lockfile, and reads engines and scripts", async () => {
    const manifest = {
      packageManager: "pnpm@11.21.0",
      engines: { node: ">=22.13" },
      scripts: { test: "node --test", build: "tsc" },
    };
    await withRoot({ "package.json": JSON.stringify(manifest), "package-lock.json": "{}" }, async (root) => {
      const toolchain = await detectToolchain(root);
      assert.deepEqual(
        toolchain.tools.map((tool) => tool.tool),
        ["pnpm 11.21.0", "Node >=22.13"],
      );
      assert.deepEqual(toolchain.scripts, [
        { name: "build", command: "pnpm build" },
        { name: "test", command: "pnpm test" },
      ]);
    });
  });

  test("falls back to the lockfile, and spells npm scripts with run", async () => {
    await withRoot({ "package.json": JSON.stringify({ scripts: { lint: "eslint ." } }), "package-lock.json": "{}" }, async (root) => {
      const toolchain = await detectToolchain(root);
      assert.equal(toolchain.tools[0]?.tool, "npm");
      assert.deepEqual(toolchain.scripts, [{ name: "lint", command: "npm run lint" }]);
    });
  });

  test("leaves lifecycle hooks out, since nobody should run a publish step by hand", async () => {
    const scripts = { build: "tsc", prebuild: "rm -rf dist", prepublishOnly: "tsc", postinstall: "patch" };
    await withRoot({ "package.json": JSON.stringify({ scripts }), "pnpm-lock.yaml": "" }, async (root) => {
      assert.deepEqual(
        (await detectToolchain(root)).scripts.map((script) => script.name),
        ["build"],
      );
    });
  });

  test("lists no scripts when nothing proves which package manager runs them", async () => {
    await withRoot({ "package.json": JSON.stringify({ scripts: { test: "x" } }) }, async (root) => {
      assert.deepEqual((await detectToolchain(root)).scripts, []);
    });
  });

  test("names a wrapper as the thing to use, and the system binary as the thing not to", async () => {
    await withRoot({ gradlew: "", "build.gradle.kts": "", mvnw: "" }, async (root) => {
      const uses = (await detectToolchain(root)).tools.map((tool) => [tool.tool, tool.use]);
      assert.deepEqual(uses, [
        ["Gradle wrapper", "`./gradlew <task>`, never `gradle`"],
        ["Maven wrapper", "`./mvnw <goal>`, never `mvn`"],
      ]);
    });
  });

  test("reads the Go version from go.mod, and recognises uv and Cargo", async () => {
    await withRoot({ "go.mod": "module example\n\ngo 1.24\n", "uv.lock": "", "Cargo.toml": "" }, async (root) => {
      assert.deepEqual(
        (await detectToolchain(root)).tools.map((tool) => tool.tool),
        ["uv", "Cargo", "Go 1.24"],
      );
    });
  });

  test("detects nothing, and says so, in a root that proves nothing", async () => {
    await withRoot({ "README.md": "# x" }, async (root) => {
      const toolchain = await detectToolchain(root);
      assert.deepEqual(toolchain.tools, []);
      assert.match(renderToolchain(toolchain), /Nothing at the repository root identifies a toolchain/);
    });
  });

  test("survives a manifest that does not parse", async () => {
    await withRoot({ "package.json": "{ not json" }, async (root) => {
      assert.deepEqual(await detectToolchain(root), { tools: [], scripts: [] });
    });
  });
});
