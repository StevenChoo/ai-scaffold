/**
 * Config file reading, against temporary files only.
 *
 * The cases worth holding are the ones where a file and a flag disagree, and the ones where a
 * file is wrong in a way that must not be guessed at.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { UsageError } from "../result.js";
import { locateConfig, readConfig, withConfig } from "./config.js";
import { parseInitArguments } from "./init.js";

/** Runs a case against a config file written into a temporary directory. */
async function withConfigFile<T>(
  contents: string,
  run: (path: string, directory: string) => Promise<T>,
  name = "ai-scaffold.yaml",
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "ai-scaffold-config-"));
  try {
    const path = join(directory, name);
    await writeFile(path, contents, "utf8");
    return await run(path, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("readConfig", () => {
  test("reads every setting a run can be given", async () => {
    await withConfigFile(
      [
        "folder: .agent",
        "about: |",
        "  A tool.",
        "",
        "  With two paragraphs.",
        "folders: [context, skills]",
        "skills:",
        "  - git-flow",
        "  - humanizer",
        "tools: [ponytail]",
        "extras: [ponytail-review]",
        "options: [agent-info]",
        "gitignore: false",
        "track-version: false",
        "claude-md: true",
        "mode: fresh",
        "backup: true",
        "migrate-instructions: false",
        "",
      ].join("\n"),
      async (path) => {
        const config = await readConfig(path);
        assert.equal(config.folderName, ".agent");
        assert.equal(config.projectAbout, "A tool.\n\nWith two paragraphs.\n");
        assert.deepEqual(config.folders, ["context", "skills"]);
        assert.deepEqual(config.skills, ["git-flow", "humanizer"]);
        assert.deepEqual(config.tools, ["ponytail"]);
        assert.deepEqual(config.extras, ["ponytail-review"]);
        assert.deepEqual(config.options, ["agent-info"]);
        assert.equal(config.updateGitignore, false);
        assert.equal(config.trackVersion, false);
        assert.equal(config.createClaudeMd, true);
        assert.equal(config.mode, "fresh");
        assert.equal(config.backup, true);
        assert.equal(config.migrateInstructions, false);
      },
    );
  });

  test("reads an empty list as an empty selection", async () => {
    await withConfigFile("skills: []\n", async (path) => {
      assert.deepEqual((await readConfig(path)).skills, []);
    });
  });

  test("treats a key with no value as unanswered", async () => {
    await withConfigFile("folder:\nskills: [git-flow]\n", async (path) => {
      const config = await readConfig(path);
      assert.equal(config.folderName, undefined);
      assert.deepEqual(config.skills, ["git-flow"]);
    });
  });

  test("rejects an unknown setting rather than ignoring it", async () => {
    await withConfigFile("skils: [git-flow]\n", async (path) => {
      await assert.rejects(readConfig(path), (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /unknown setting "skils"/);
        return true;
      });
    });
  });

  test("rejects a setting of the wrong shape", async () => {
    await withConfigFile("skills: git-flow\n", async (path) => {
      await assert.rejects(readConfig(path), (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /skills must be a list of names/);
        return true;
      });
    });
    await withConfigFile("gitignore: yes please\n", async (path) => {
      await assert.rejects(readConfig(path), (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /gitignore must be true or false/);
        return true;
      });
    });
    await withConfigFile("mode: rebuild\n", async (path) => {
      await assert.rejects(readConfig(path), (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.match(error.message, /mode must be/);
        return true;
      });
    });
  });

  test("reports the file when the YAML itself is unusable", async () => {
    await withConfigFile("folders: [context\n", async (path) => {
      await assert.rejects(readConfig(path), (error: unknown) => {
        assert.ok(error instanceof UsageError);
        assert.ok(error.message.startsWith(path), error.message);
        return true;
      });
    });
  });

  test("refuses a named file that is not there", async () => {
    await assert.rejects(readConfig(join(tmpdir(), "ai-scaffold-missing.yaml")), UsageError);
  });
});

describe("locateConfig", () => {
  test("finds a config file in the target directory", async () => {
    await withConfigFile("skills: []\n", async (path, directory) => {
      assert.equal(locateConfig(directory, undefined), path);
    });
  });

  test("accepts the .yml spelling too", async () => {
    await withConfigFile(
      "skills: []\n",
      async (path, directory) => {
        assert.equal(locateConfig(directory, undefined), path);
      },
      "ai-scaffold.yml",
    );
  });

  test("prefers an explicit path over anything in the target", async () => {
    await withConfigFile("skills: []\n", async (_path, directory) => {
      assert.equal(locateConfig(directory, "/elsewhere/config.yaml"), "/elsewhere/config.yaml");
    });
  });

  test("returns nothing when the target has no config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-scaffold-config-"));
    try {
      assert.equal(locateConfig(directory, undefined), undefined);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("withConfig", () => {
  test("fills in only what the command line left open", () => {
    const given = parseInitArguments([".", "--skills", "git-flow"]);
    const merged = withConfig(given, {
      folderName: ".agent",
      skills: ["humanizer"],
      updateGitignore: false,
    });
    assert.deepEqual(merged.skills, ["git-flow"], "an explicit flag wins over the file");
    assert.equal(merged.folderName, ".agent");
    assert.equal(merged.updateGitignore, false);
  });

  test("leaves a run with no config exactly as parsed", () => {
    const given = parseInitArguments([".", "--no-skills"]);
    assert.deepEqual(withConfig(given, {}), given);
  });

  test("keeps a flag that turned a selection off", () => {
    const given = parseInitArguments([".", "--no-tools"]);
    const merged = withConfig(given, { tools: ["ponytail"] });
    assert.deepEqual(merged.tools, [], "--no-tools is an answer, not an absence");
  });
});

describe("wrap", () => {
  test("takes a column count written as a number or as text", async () => {
    await withConfigFile("wrap: 120\n", async (path) => {
      assert.equal((await readConfig(path)).wrap, "120");
    });
    await withConfigFile('wrap: "120"\n', async (path) => {
      assert.equal((await readConfig(path)).wrap, "120");
    });
  });

  test("takes no-reflow as the other answer", async () => {
    await withConfigFile("wrap: no-reflow\n", async (path) => {
      assert.equal((await readConfig(path)).wrap, "no-reflow");
    });
  });

  test("rejects a width that would break a table heading, and anything unrecognised", async () => {
    for (const value of ["12", "wide", "0", "-80"]) {
      await withConfigFile(`wrap: ${JSON.stringify(value)}\n`, async (path) => {
        await assert.rejects(readConfig(path), (error: unknown) => {
          assert.ok(error instanceof UsageError);
          assert.match(error.message, /column count of 40 or more/);
          return true;
        });
      });
    }
  });

  test("reads the flag, and the flag beats the file", () => {
    assert.equal(parseInitArguments([".", "--wrap", "no-reflow"]).wrap, "no-reflow");
    assert.equal(parseInitArguments([".", "--wrap=100"]).wrap, "100");
    const merged = withConfig(parseInitArguments([".", "--wrap", "100"]), { wrap: "160" });
    assert.equal(merged.wrap, "100");
  });

  test("rejects a flag value that is neither a width nor no-reflow", () => {
    assert.throws(() => parseInitArguments([".", "--wrap", "soon"]), UsageError);
  });
});

describe("environment", () => {
  test("takes multi-line constraints as text", async () => {
    await withConfigFile("environment: |\n  No Docker.\n  Test services run on the host.\n", async (path) => {
      assert.equal((await readConfig(path)).environment, "No Docker.\nTest services run on the host.\n");
    });
  });

  test("reads the flag, and the flag beats the file", () => {
    const merged = withConfig(parseInitArguments([".", "--environment", "From the flag."]), { environment: "From the file." });
    assert.equal(merged.environment, "From the flag.");
  });
});
