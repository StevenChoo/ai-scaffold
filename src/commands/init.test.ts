/**
 * Scaffold behavior, exercised against temporary directories only.
 *
 * A test must never write into a real project, so every case creates and removes its own target.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { ExitCode, UsageError } from "../result.js";
import { FOLDER_HINTS, readTemplateFolders } from "../scaffold/catalog.js";
import { isIndexed, parseIndexTable } from "../scaffold/reindex.js";
import { applyRequirements } from "../scaffold/requirements.js";
import {
  OFFERED_FILE,
  VERSION_FILE,
  detectExistingInstall,
  packageVersion,
  parseInitArguments,
  planScaffold,
  runInit,
  templateRoot,
  transformAiReferences,
} from "./init.js";

describe("parseInitArguments", () => {
  test("defaults target to current directory when omitted", () => {
    const options = parseInitArguments([]);
    assert.ok(options.target.startsWith("/"), `expected absolute path, got ${options.target}`);
  });

  test("resolves an explicit target to an absolute path", () => {
    const options = parseInitArguments(["."]);
    assert.ok(options.target.startsWith("/"), `expected absolute path, got ${options.target}`);
  });

  test("defaults to refusing overwrites and to writing", () => {
    const options = parseInitArguments(["."]);
    assert.equal(options.force, false);
    assert.equal(options.dryRun, false);
    assert.equal(options.yes, false);
  });

  test("accepts documented flags", () => {
    const options = parseInitArguments([
      ".",
      "--force",
      "--dry-run",
      "-y",
      "--folder",
      ".custom-ai",
      "--about",
      "Building a developer productivity tool",
      "--no-gitignore",
      "--no-claude-md",
    ]);
    assert.equal(options.force, true);
    assert.equal(options.dryRun, true);
    assert.equal(options.yes, true);
    assert.equal(options.folderName, ".custom-ai");
    assert.equal(options.projectAbout, "Building a developer productivity tool");
    assert.equal(options.updateGitignore, false);
    assert.equal(options.createClaudeMd, false);
  });

  test("accepts --folder= and --folder-name= syntax", () => {
    const opt1 = parseInitArguments(["--folder=.agent"]);
    assert.equal(opt1.folderName, ".agent");

    const opt2 = parseInitArguments(["--folder-name=ai-tools"]);
    assert.equal(opt2.folderName, "ai-tools");
  });

  test("accepts --about= and --description= syntax", () => {
    const opt1 = parseInitArguments(["--about=A CLI helper"]);
    assert.equal(opt1.projectAbout, "A CLI helper");

    const opt2 = parseInitArguments(["--description=An AI workspace"]);
    assert.equal(opt2.projectAbout, "An AI workspace");
  });

  test("leaves mode unset so an existing install can be asked about", () => {
    assert.equal(parseInitArguments(["."]).mode, undefined);
  });

  test("accepts the modes for a target that already has agent tooling", () => {
    assert.equal(parseInitArguments([".", "--update"]).mode, "update");
    assert.equal(parseInitArguments([".", "--fresh"]).mode, "fresh");
    assert.equal(parseInitArguments([".", "--rescaffold"]).mode, "fresh");
  });

  test("rejects contradictory modes rather than letting the last flag win", () => {
    assert.throws(() => parseInitArguments([".", "--update", "--fresh"]), UsageError);
    assert.throws(() => parseInitArguments([".", "--fresh", "--update"]), UsageError);
  });

  test("rejects an unknown option rather than ignoring it", () => {
    assert.throws(() => parseInitArguments([".", "--recursive"]), UsageError);
  });

  test("rejects a second target rather than guessing which one is meant", () => {
    assert.throws(() => parseInitArguments(["one", "two"]), UsageError);
  });
});

describe("transformAiReferences", () => {
  test("returns original content when folderName is .ai", () => {
    const text = "Start at [`.ai/_index.md`](.ai/_index.md)";
    assert.equal(transformAiReferences(text, ".ai"), text);
  });

  test("substitutes .ai references with custom folder name", () => {
    const text =
      "Start at [`.ai/_index.md`](.ai/_index.md). Follow `.ai/templates/_index.template.md`.";
    const result = transformAiReferences(text, ".agent");
    assert.equal(
      result,
      "Start at [`.agent/_index.md`](.agent/_index.md). Follow `.agent/templates/_index.template.md`.",
    );
  });

  test("does not replace false positives like domain.ai or openai", () => {
    const text = "Visit domain.ai or use openai models.";
    assert.equal(transformAiReferences(text, ".agent"), text);
  });
});

describe("template payload", () => {
  test("ships the entry point an agent reads first", () => {
    assert.ok(existsSync(join(templateRoot(), "AGENTS.md")));
  });

  test("ships an indexed agent tree, adding-context skill, and templates", () => {
    for (const relative of [
      ".ai/_index.md",
      ".ai/context/_index.md",
      ".ai/prompts/_index.md",
      ".ai/skills/_index.md",
      ".ai/skills/adding-context/SKILL.md",
      ".ai/templates/_index.md",
      ".ai/templates/_index.template.md",
      ".ai/templates/context.template.md",
      ".ai/templates/skill.template.md",
      ".ai/templates/prompt.template.md",
    ]) {
      assert.ok(existsSync(join(templateRoot(), relative)), `missing ${relative}`);
    }
  });

  test("does not ship omitted context files in default template payload", () => {
    assert.equal(existsSync(join(templateRoot(), ".ai", "context", "application.md")), false);
    assert.equal(existsSync(join(templateRoot(), ".ai", "context", "related-projects.md")), false);
    assert.equal(existsSync(join(templateRoot(), ".ai", "context", "team.md")), false);
    assert.ok(existsSync(join(templateRoot(), ".ai", "context", "project.md")));
  });

  test("does not ship a docs directory in template root", () => {
    assert.equal(existsSync(join(templateRoot(), "docs")), false);
  });

  test("default project.md announces that it is a placeholder", async () => {
    const contents = await readFile(
      join(templateRoot(), ".ai", "context", "project.md"),
      "utf8",
    );
    assert.match(
      contents,
      /This file is a scaffold/,
      "project.md must tell the reader it is unfilled when not populated",
    );
  });
});

describe("scaffolding a target", () => {
  test("creates standard .ai folder, AGENTS.md and CLAUDE.md by default, and commits the folder", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      const code = await runInit([target, "-y"]);
      assert.equal(code, ExitCode.Success);

      assert.ok(existsSync(join(target, "AGENTS.md")));
      assert.ok(existsSync(join(target, "CLAUDE.md")));
      assert.equal(existsSync(join(target, ".gitignore")), false, "the folder a session's memory lives in is not ignored by default");
      assert.ok(existsSync(join(target, ".ai", "_index.md")));
      assert.ok(existsSync(join(target, ".ai", "templates", "_index.md")));
      assert.ok(existsSync(join(target, ".ai", "skills", "adding-context", "SKILL.md")));

      const claudeContent = await readFile(join(target, "CLAUDE.md"), "utf8");
      assert.equal(claudeContent.trim(), "@AGENTS.md");


    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("populates project.md when --about is provided", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      const code = await runInit([
        target,
        "-y",
        "--about",
        "A fast static site generator with hot reloading",
      ]);
      assert.equal(code, ExitCode.Success);

      const projectContent = await readFile(join(target, ".ai", "context", "project.md"), "utf8");
      assert.match(projectContent, /A fast static site generator with hot reloading/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("rejects a folder name that would leave the target", async () => {
    const parent = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    const target = join(parent, "target");
    await mkdir(target);
    try {
      for (const name of ["../escape", "", ".", "..", ".git", "a/b"]) {
        await assert.rejects(runInit([target, "-y", `--folder=${name}`]), UsageError, `accepted ${JSON.stringify(name)}`);
      }
      // A config file found in the target is someone else's input, so it gets the same check.
      await writeFile(join(target, "ai-scaffold.yaml"), "folder: ../escape\n");
      await assert.rejects(runInit([target, "-y"]), UsageError);

      assert.deepEqual(await readdir(parent), ["target"]);
      assert.deepEqual(await readdir(target), ["ai-scaffold.yaml"]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("supports custom folder name and updates references", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      const code = await runInit([target, "-y", "--folder", ".my-agent", "--gitignore"]);
      assert.equal(code, ExitCode.Success);

      assert.ok(existsSync(join(target, ".my-agent", "_index.md")));
      assert.equal(existsSync(join(target, ".ai")), false);

      const agentsContent = await readFile(join(target, "AGENTS.md"), "utf8");
      assert.match(agentsContent, /\.my-agent\/_index\.md/);
      assert.doesNotMatch(agentsContent, /\.ai\/_index\.md/);

      const gitignoreContent = await readFile(join(target, ".gitignore"), "utf8");
      assert.match(gitignoreContent, /\.my-agent\//);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("respects --no-claude-md and --no-gitignore options", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      const code = await runInit([target, "-y", "--no-claude-md", "--no-gitignore"]);
      assert.equal(code, ExitCode.Success);

      assert.equal(existsSync(join(target, "CLAUDE.md")), false);
      assert.equal(existsSync(join(target, ".gitignore")), false);
      assert.ok(existsSync(join(target, "AGENTS.md")));
      assert.ok(existsSync(join(target, ".ai", "_index.md")));
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("appends to an existing .gitignore without overwriting other entries", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await writeFile(join(target, ".gitignore"), "node_modules/\ndist/\n");
      const code = await runInit([target, "-y", "--gitignore"]);
      assert.equal(code, ExitCode.Success);

      const content = await readFile(join(target, ".gitignore"), "utf8");
      assert.match(content, /node_modules\//);
      assert.match(content, /dist\//);
      assert.match(content, /\.ai\//);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a collision outside recognised agent tooling still blocks without --fresh", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await writeFile(join(target, "CLAUDE.md"), "pre-existing content\n");
      const code = await runInit([target, "-y"]);
      assert.equal(code, ExitCode.Failure);

      assert.equal(await readFile(join(target, "CLAUDE.md"), "utf8"), "pre-existing content\n");
      assert.equal(existsSync(join(target, ".ai")), false, "a blocked run must write nothing");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("--force replaces existing files", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await writeFile(join(target, "AGENTS.md"), "pre-existing content\n");
      const code = await runInit([target, "-y", "--force"]);
      assert.equal(code, ExitCode.Success);

      const content = await readFile(join(target, "AGENTS.md"), "utf8");
      assert.notEqual(content, "pre-existing content\n");
      assert.match(content, /# Agent guide/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("--dry-run does not write anything", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      const code = await runInit([target, "-y", "--dry-run"]);
      assert.equal(code, ExitCode.Success);

      const entries = await readdir(target);
      assert.equal(entries.length, 0);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("detectExistingInstall", () => {
  test("reports none for a repository with no agent tooling", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      assert.deepEqual(await detectExistingInstall(target), { kind: "none" });
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("recognises a scaffold this tool produced", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      assert.deepEqual(await detectExistingInstall(target), {
        kind: "scaffold",
        folderName: ".ai",
      });
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("finds a renamed AI folder when --folder is not repeated", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--folder", ".my-agent"]);
      assert.deepEqual(await detectExistingInstall(target), {
        kind: "scaffold",
        folderName: ".my-agent",
      });
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("reports agents-md when another tool's guide is the only sign", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await writeFile(join(target, "AGENTS.md"), "# Someone else's guide\n");
      assert.deepEqual(await detectExistingInstall(target), { kind: "agents-md" });
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("does not mistake an indexed docs folder for an AI folder", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await mkdir(join(target, "docs", "context"), { recursive: true });
      await writeFile(join(target, "docs", "_index.md"), "# Docs index\n");
      assert.deepEqual(await detectExistingInstall(target), { kind: "none" });
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("recording the scaffold version", () => {
  const versionFile = (target: string): string => join(target, ".ai", VERSION_FILE);

  test("a first scaffold records the package version, and --no-track-version records none", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    const declined = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      const lines = (await readFile(versionFile(target), "utf8")).split("\n");
      assert.match(lines[0] ?? "", /^# /);
      assert.equal(lines[1], await packageVersion());

      await runInit([declined, "-y", "--no-track-version"]);
      assert.equal(existsSync(versionFile(declined)), false);
    } finally {
      await rm(target, { recursive: true, force: true });
      await rm(declined, { recursive: true, force: true });
    }
  });

  test("an update never dates an older tree as current; a fresh run does", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--no-track-version"]);
      await runInit([target, "-y"]);
      assert.equal(existsSync(versionFile(target)), false, "update kept an untracked tree untracked");

      await runInit([target, "-y", "--fresh"]);
      assert.ok(existsSync(versionFile(target)));
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("backing up before a fresh scaffold", () => {
  const backupRoot = (target: string): string => join(target, ".ai", ".scaffold-backup");
  const instructions = (target: string): string => join(backupRoot(target), "AGENT_AISCAFFOLD_MIGRATE_INSTRUCTIONS.md");

  test("copies the setup as it was, untouched by reindexing, with migration instructions", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      await writeFile(join(target, ".ai", "context", "project.md"), "# Hand-written project context\n");
      // A stale index: reindexing the backup would drop the row for the removed folder.
      await rm(join(target, ".ai", "prompts"), { recursive: true });
      const staleIndex = await readFile(join(target, ".ai", "_index.md"), "utf8");

      assert.equal(await runInit([target, "-y", "--fresh"]), ExitCode.Success);

      assert.equal(await readFile(join(backupRoot(target), ".ai", "context", "project.md"), "utf8"), "# Hand-written project context\n");
      assert.equal(await readFile(join(backupRoot(target), ".ai", "_index.md"), "utf8"), staleIndex);
      assert.ok(existsSync(join(backupRoot(target), "AGENTS.md")));
      assert.equal(existsSync(join(backupRoot(target), ".ai", ".scaffold-backup")), false, "the backup does not contain itself");
      assert.doesNotMatch(await readFile(join(target, ".ai", "_index.md"), "utf8"), /scaffold-backup/);

      const text = await readFile(instructions(target), "utf8");
      assert.match(text, new RegExp(`from ai-scaffold ${(await packageVersion()).replaceAll(".", "\\.")}`));
      assert.match(text, /diff -rq \.ai\/\.scaffold-backup\/\.ai \.ai -x \.scaffold-backup/);
      assert.match(text, /Should I delete the backup folder\?/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a renamed folder gets an update aimed at it, and the old folder is offered for removal", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      await runInit([target, "-y", "--fresh", "--folder", "ai"]);

      const text = await readFile(join(target, "ai", ".scaffold-backup", "AGENT_AISCAFFOLD_MIGRATE_INSTRUCTIONS.md"), "utf8");
      assert.match(text, /ai-scaffold init \. --folder ai --update -y/);
      assert.match(text, /Should I delete the backup folder and the old `\.ai\/` folder\?/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("--no-migrate-instructions keeps the copy alone, and --no-backup keeps nothing", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      await runInit([target, "-y", "--fresh", "--no-migrate-instructions"]);
      assert.ok(existsSync(join(backupRoot(target), "AGENTS.md")));
      assert.equal(existsSync(instructions(target)), false);

      await rm(backupRoot(target), { recursive: true });
      await runInit([target, "-y", "--fresh", "--no-backup"]);
      assert.equal(existsSync(backupRoot(target)), false);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("an update backs up only when asked, without instructions, and a second backup refuses to replace the first", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      await runInit([target, "-y", "--update"]);
      assert.equal(existsSync(backupRoot(target)), false);

      await runInit([target, "-y", "--update", "--backup"]);
      assert.ok(existsSync(join(backupRoot(target), "AGENTS.md")));
      assert.equal(existsSync(instructions(target)), false, "an update has nothing to migrate back");
      await rm(backupRoot(target), { recursive: true });

      await runInit([target, "-y", "--fresh"]);
      const first = await readFile(instructions(target), "utf8");
      await assert.rejects(runInit([target, "-y", "--fresh"]), UsageError);
      assert.equal(await readFile(instructions(target), "utf8"), first);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("re-running against an existing install", () => {
  const skillsOf = async (target: string): Promise<string[]> => await readdir(join(target, ".ai", "skills"));

  test("an update ticks a skill new since the last run, but not one that was declined", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      // An install from before the record: a skill it lacks is one it was never offered.
      await rm(join(target, ".ai", OFFERED_FILE));
      await rm(join(target, ".ai", "skills", "design"), { recursive: true });
      await runInit([target, "-y"]);
      assert.ok((await skillsOf(target)).includes("design"), "a legacy install gains the skill it never saw");

      await runInit([target, "-y", "--skills", "git-flow"]);
      await runInit([target, "-y"]);
      assert.equal((await skillsOf(target)).includes("design"), false, "a recorded, declined skill stays declined");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("unticking removes an unchanged folder or skill, and keeps one the developer changed", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--skills", "git-flow,research,design,humanizer", "--tools", "ponytail", "--extras", "ponytail-review"]);
      await writeFile(join(target, ".ai", "skills", "research", "SKILL.md"), "# Our own research workflow\n");

      await runInit([target, "-y", "--folders", "context,skills,templates", "--skills", "git-flow", "--no-tools"]);

      const skills = await skillsOf(target);
      for (const name of ["design", "humanizer", "ponytail", "ponytail-review"]) {
        assert.equal(skills.includes(name), false, `${name} was unchanged and unticked`);
      }
      assert.equal(existsSync(join(target, ".ai", "prompts")), false, "an unchanged folder goes too");
      assert.equal(await readFile(join(target, ".ai", "skills", "research", "SKILL.md"), "utf8"), "# Our own research workflow\n");
      assert.ok(skills.includes("git-flow"));
      await assertIndexesDescribeTree(join(target, ".ai"));
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a config file found beside a scaffolded tree refuses the run, unless --config names it", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      const config = join(target, "ai-scaffold.yaml");
      await writeFile(config, "skills: [git-flow, design]\n");
      assert.equal(await runInit([target, "-y"]), ExitCode.Success, "a first scaffold still finds it on its own");

      await assert.rejects(runInit([target, "-y"]), /ai-scaffold\.yaml is for a first scaffold/);
      await assert.rejects(runInit([target, "-y", "--fresh"]), UsageError);

      assert.equal(await runInit([target, "-y", "--config", config]), ExitCode.Success);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("update fills gaps and leaves edited files untouched", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);

      const edited = join(target, ".ai", "context", "project.md");
      await writeFile(edited, "# Hand-written project context\n");
      await rm(join(target, ".ai", "prompts", "_index.md"));

      const code = await runInit([target, "-y"]);
      assert.equal(code, ExitCode.Success);

      assert.equal(
        await readFile(edited, "utf8"),
        "# Hand-written project context\n",
        "update must not overwrite a file the developer changed",
      );
      assert.ok(
        existsSync(join(target, ".ai", "prompts", "_index.md")),
        "update must restore a file that went missing",
      );
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("--fresh replaces scaffold files that were edited", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);

      const edited = join(target, ".ai", "context", "project.md");
      await writeFile(edited, "# Hand-written project context\n");

      const code = await runInit([target, "-y", "--fresh"]);
      assert.equal(code, ExitCode.Success);

      const content = await readFile(edited, "utf8");
      assert.notEqual(content, "# Hand-written project context\n");
      assert.match(content, /# Project context/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("--fresh keeps files the scaffold does not ship", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      const ownFile = join(target, ".ai", "context", "team.md");
      await writeFile(ownFile, "# Team\n");

      assert.equal(await runInit([target, "-y", "--fresh"]), ExitCode.Success);
      assert.equal(await readFile(ownFile, "utf8"), "# Team\n");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("scaffolds around another tool's AGENTS.md instead of refusing", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await writeFile(join(target, "AGENTS.md"), "# Someone else's guide\n");

      const code = await runInit([target, "-y"]);
      assert.equal(code, ExitCode.Success);

      assert.equal(
        await readFile(join(target, "AGENTS.md"), "utf8"),
        "# Someone else's guide\n",
        "update must not replace a guide this tool did not write",
      );
      assert.ok(existsSync(join(target, ".ai", "_index.md")));
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("reuses a renamed AI folder rather than scaffolding a second tree", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--folder", ".my-agent"]);
      assert.equal(await runInit([target, "-y"]), ExitCode.Success);

      assert.equal(
        existsSync(join(target, ".ai")),
        false,
        "a second run must not create a default folder beside the renamed one",
      );
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("--dry-run over an existing install writes nothing", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      const edited = join(target, ".ai", "context", "project.md");
      await writeFile(edited, "# Hand-written project context\n");

      assert.equal(await runInit([target, "-y", "--fresh", "--dry-run"]), ExitCode.Success);
      assert.equal(await readFile(edited, "utf8"), "# Hand-written project context\n");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

/**
 * Asserts that every index table under an AI folder lists exactly the children present.
 *
 * Derived from the filesystem rather than a fixed list, so a folder or skill added to the
 * payload later is covered without editing this test.
 */
async function assertIndexesDescribeTree(root: string): Promise<void> {
  const indexPath = join(root, "_index.md");
  assert.ok(existsSync(indexPath), `missing index: ${indexPath}`);

  const rows = parseIndexTable(await readFile(indexPath, "utf8"));
  const entries = (await readdir(root, { withFileTypes: true })).filter((entry) =>
    isIndexed(entry.name, entry.isFile()),
  );

  const listed = new Set(
    rows.flatMap((row) => (row.target === null ? [] : [row.target.split("/")[0] ?? ""])),
  );

  for (const entry of entries) {
    assert.ok(listed.has(entry.name), `${indexPath} does not list ${entry.name}`);
  }
  assert.equal(
    listed.size,
    entries.length,
    `${indexPath} lists ${listed.size} entries for ${entries.length} children`,
  );

  for (const row of rows) {
    if (row.target !== null) {
      assert.ok(existsSync(join(root, row.target)), `${indexPath} links to missing ${row.target}`);
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory() && existsSync(join(root, entry.name, "_index.md"))) {
      await assertIndexesDescribeTree(join(root, entry.name));
    }
  }
}

/** Every Markdown file a scaffold wrote, as target-relative paths. */
async function scaffoldedMarkdown(target: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(relative: string): Promise<void> {
    for (const entry of await readdir(join(target, relative), { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(next);
      } else if (entry.name.endsWith(".md")) {
        found.push(next);
      }
    }
  }
  await walk("");
  return found;
}

describe("selecting what to scaffold", () => {
  test("writes only the chosen folders, including none of the optional ones", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      const code = await runInit([target, "-y", "--folders", "context", "--no-skills"]);
      assert.equal(code, ExitCode.Success);

      assert.ok(existsSync(join(target, ".ai", "context")));
      assert.equal(existsSync(join(target, ".ai", "prompts")), false);
      assert.equal(existsSync(join(target, ".ai", "skills")), false);
      assert.equal(existsSync(join(target, ".ai", "templates")), false);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("installs only the chosen skills", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      assert.equal(await runInit([target, "-y", "--skills", "git-flow"]), ExitCode.Success);

      const installed = await readdir(join(target, ".ai", "skills"), { withFileTypes: true });
      assert.deepEqual(
        installed.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
        ["git-flow"],
      );
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("rejects a name the payload does not ship", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await assert.rejects(() => runInit([target, "-y", "--skills", "no-such-skill"]), UsageError);
      await assert.rejects(() => runInit([target, "-y", "--folders", "no-such-folder"]), UsageError);
      assert.equal(existsSync(join(target, ".ai")), false, "a rejected run must write nothing");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("treats an empty --skills list and --no-skills alike", () => {
    assert.deepEqual(parseInitArguments([".", "--skills", "none"]).skills, []);
    assert.deepEqual(parseInitArguments([".", "--no-skills"]).skills, []);
    assert.deepEqual(parseInitArguments([".", "--skills=git-flow, adding-context"]).skills, [
      "git-flow",
      "adding-context",
    ]);
  });
});

describe("choosing external skills and tools", () => {
  const installed = async (target: string): Promise<string[]> =>
    (await readdir(join(target, ".ai", "skills"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

  test("installs no external skill or tool unless it is asked for", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      assert.deepEqual(await installed(target), ["adding-context", "design", "git-flow", "implement", "research", "writing-project-docs"]);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("installs an external skill named alongside our own", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      assert.equal(await runInit([target, "-y", "--skills", "git-flow,humanizer"]), ExitCode.Success);
      assert.deepEqual(await installed(target), ["git-flow", "humanizer"]);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("installs a tool from its own menu", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      assert.equal(await runInit([target, "-y", "--tools", "ponytail"]), ExitCode.Success);
      assert.ok((await installed(target)).includes("ponytail"));
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("brings the licence and provenance with an external skill", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--skills", "simple-english"]);

      const directory = join(target, ".ai", "skills", "simple-english");
      for (const file of ["SKILL.md", "LICENSE", "SOURCE.md"]) {
        assert.ok(existsSync(join(directory, file)), `simple-english arrived without ${file}`);
      }
      assert.match(await readFile(join(directory, "SOURCE.md"), "utf8"), /AminBlg/);
      assert.match(await readFile(join(directory, "LICENSE"), "utf8"), /Copyright/i);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("indexes an external skill from its own description", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--skills", "humanizer"]);

      const index = await readFile(join(target, ".ai", "skills", "_index.md"), "utf8");
      assert.match(index, /\[`humanizer\/`\]\(humanizer\/SKILL\.md\)/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("installs no external content when the skills folder is declined", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--folders", "context", "--skills", "humanizer", "--tools", "ponytail"]);
      assert.equal(existsSync(join(target, ".ai", "skills")), false);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("keeps an installed external skill on a re-run with no flags", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--skills", "git-flow,humanizer", "--tools", "ponytail"]);
      assert.equal(await runInit([target, "-y"]), ExitCode.Success);

      const after = await installed(target);
      assert.ok(after.includes("humanizer"), "a re-run must not drop an external skill");
      assert.ok(after.includes("ponytail"), "a re-run must not drop an installed tool");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("rejects a name no provider offers, listing what is available", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await assert.rejects(() => runInit([target, "-y", "--tools", "no-such-tool"]), /available: /);
      await assert.rejects(() => runInit([target, "-y", "--skills", "no-such-skill"]), /available: /);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("parses the tools list, treating none as empty", () => {
    assert.deepEqual(parseInitArguments([".", "--tools", "ponytail"]).tools, ["ponytail"]);
    assert.deepEqual(parseInitArguments([".", "--no-tools"]).tools, []);
    assert.deepEqual(parseInitArguments([".", "--tools=none"]).tools, []);
    assert.equal(parseInitArguments(["."]).tools, undefined);
  });
});

describe("skill options", () => {
  const attribution = async (target: string): Promise<string> =>
    await readFile(join(target, ".ai", "skills", "git-flow", "SKILL.md"), "utf8");

  test("defaults to no, instructing the agent to leave itself out", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      assert.equal(await runInit([target, "-y"]), ExitCode.Success);

      const skill = await attribution(target);
      assert.match(skill, /Do not record the agent anywhere in the commit\./);
      assert.doesNotMatch(skill, /Record the agent in the commit message trailers/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("records the agent when the option is enabled", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      assert.equal(await runInit([target, "-y", "--options", "agent-info"]), ExitCode.Success);

      const skill = await attribution(target);
      assert.match(skill, /Record the agent in the commit message trailers/);
      assert.doesNotMatch(skill, /Do not record the agent anywhere/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("never installs both answers, whichever was chosen", async () => {
    for (const argv of [[], ["--options", "agent-info"]]) {
      const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
      try {
        await runInit([target, "-y", ...argv]);
        const skill = await attribution(target);
        const sides = [/Do not record the agent anywhere/, /Record the agent in the commit message trailers/].filter(
          (side) => side.test(skill),
        );
        assert.equal(sides.length, 1, `expected exactly one answer for ${JSON.stringify(argv)}`);
        assert.doesNotMatch(skill, /agent-generated:requires/);
      } finally {
        await rm(target, { recursive: true, force: true });
      }
    }
  });

  test("strips the fields that configure the scaffolder, keeping the ones that do not", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);

      const skill = await attribution(target);
      assert.doesNotMatch(skill, /option-name|option-prompt/, "a resolved question must not look open");
      assert.match(skill, /agents-md:/, "the directive is still read from the installed skill");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("installs a provider's core skill and none of its extras by default", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--tools", "ponytail"]);

      const skills = join(target, ".ai", "skills");
      assert.ok(existsSync(join(skills, "ponytail")), "the core skill is installed");
      for (const extra of ["ponytail-review", "ponytail-audit", "ponytail-debt"]) {
        assert.equal(existsSync(join(skills, extra)), false, `${extra} must not arrive unasked`);
      }
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("installs the extras that were asked for", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      assert.equal(
        await runInit([target, "-y", "--tools", "ponytail", "--extras", "ponytail-review,ponytail-audit"]),
        ExitCode.Success,
      );

      const skills = join(target, ".ai", "skills");
      assert.ok(existsSync(join(skills, "ponytail-review")));
      assert.ok(existsSync(join(skills, "ponytail-audit")));
      assert.equal(existsSync(join(skills, "ponytail-debt")), false);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("brings the licence with an extra, as with any other copy", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--tools", "ponytail", "--extras", "ponytail-review"]);

      const directory = join(target, ".ai", "skills", "ponytail-review");
      for (const file of ["SKILL.md", "LICENSE", "SOURCE.md"]) {
        assert.ok(existsSync(join(directory, file)), `ponytail-review arrived without ${file}`);
      }
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("rejects an extra whose provider was not selected", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await assert.rejects(() => runInit([target, "-y", "--extras", "ponytail-review"]), UsageError);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("rejects an extra no selected provider bundles", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await assert.rejects(
        () => runInit([target, "-y", "--tools", "ponytail", "--extras", "no-such-extra"]),
        /available: ponytail-review/,
      );
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("parses the extras list, treating none as empty", () => {
    assert.deepEqual(parseInitArguments([".", "--extras", "ponytail-review"]).extras, ["ponytail-review"]);
    assert.deepEqual(parseInitArguments([".", "--no-extras"]).extras, []);
    assert.equal(parseInitArguments(["."]).extras, undefined);
  });

  test("rejects an option no installed skill offers", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await assert.rejects(() => runInit([target, "-y", "--options", "no-such-option"]), UsageError);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("parses the option list, treating none as empty", () => {
    assert.deepEqual(parseInitArguments([".", "--options", "agent-info"]).options, ["agent-info"]);
    assert.deepEqual(parseInitArguments([".", "--options=none"]).options, []);
    assert.equal(parseInitArguments(["."]).options, undefined);
  });
});

describe("indexes describe what was scaffolded", () => {
  test("a full scaffold is described completely", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      await assertIndexesDescribeTree(join(target, ".ai"));
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a partial selection is described completely, with no rows for what was declined", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--folders", "context,skills", "--skills", "git-flow"]);
      await assertIndexesDescribeTree(join(target, ".ai"));

      const rootIndex = await readFile(join(target, ".ai", "_index.md"), "utf8");
      assert.doesNotMatch(rootIndex, /prompts\//, "a declined folder must not be indexed");

      const skillsIndex = await readFile(join(target, ".ai", "skills", "_index.md"), "utf8");
      assert.match(skillsIndex, /git-flow\//);
      assert.doesNotMatch(skillsIndex, /adding-context\//);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("AGENTS.md announces only the skills that were installed", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--skills", "git-flow"]);

      const agents = await readFile(join(target, "AGENTS.md"), "utf8");
      assert.match(agents, /skills\/git-flow\/SKILL\.md/);
      assert.doesNotMatch(agents, /writing-project-docs/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("AGENTS.md drops the skills bullet when no skills folder is scaffolded", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--folders", "context"]);

      const agents = await readFile(join(target, "AGENTS.md"), "utf8");
      assert.doesNotMatch(agents, /\.ai\/skills\//, "no link may point at a folder that was declined");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a skill added on a later run reaches both the index and AGENTS.md", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--skills", "git-flow"]);
      assert.equal(
        await runInit([target, "-y", "--skills", "git-flow,writing-project-docs"]),
        ExitCode.Success,
      );

      const skillsIndex = await readFile(join(target, ".ai", "skills", "_index.md"), "utf8");
      assert.match(skillsIndex, /writing-project-docs\//);

      const agents = await readFile(join(target, "AGENTS.md"), "utf8");
      assert.match(agents, /skills\/writing-project-docs\/SKILL\.md/);
      await assertIndexesDescribeTree(join(target, ".ai"));
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a hand-written file is indexed with a summary drawn from itself", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      await writeFile(
        join(target, ".ai", "context", "deployment.md"),
        "# Deployment\n\n**Purpose.** How this service reaches production.\n",
      );

      assert.equal(await runInit([target, "-y"]), ExitCode.Success);

      const contextIndex = await readFile(join(target, ".ai", "context", "_index.md"), "utf8");
      assert.match(contextIndex, /\[`deployment\.md`\]\(deployment\.md\)/);
      assert.match(contextIndex, /How this service reaches production\./);
      await assertIndexesDescribeTree(join(target, ".ai"));
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a summary a human wrote survives regeneration", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);

      const indexPath = join(target, ".ai", "context", "_index.md");
      const curated = (await readFile(indexPath, "utf8")).replace(
        /Scope, current phase, and repository rules\./,
        "Our own words about this file.",
      );
      await writeFile(indexPath, curated);

      assert.equal(await runInit([target, "-y"]), ExitCode.Success);

      const after = await readFile(indexPath, "utf8");
      assert.match(after, /Our own words about this file\./);
      assert.match(after, /\| Draft +\|/, "a status a human set must survive too");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("leaves an AGENTS.md without generated regions completely alone", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      const foreign = "# Our own guide\n\nRules we wrote ourselves.\n";
      await writeFile(join(target, "AGENTS.md"), foreign);

      assert.equal(await runInit([target, "-y"]), ExitCode.Success);
      assert.equal(
        await readFile(join(target, "AGENTS.md"), "utf8"),
        foreign,
        "regeneration must never edit a guide this tool did not write",
      );
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("--dry-run regenerates nothing", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y"]);
      await writeFile(join(target, ".ai", "context", "extra.md"), "# Extra\n");
      const before = await readFile(join(target, ".ai", "context", "_index.md"), "utf8");

      assert.equal(await runInit([target, "-y", "--dry-run"]), ExitCode.Success);
      assert.equal(await readFile(join(target, ".ai", "context", "_index.md"), "utf8"), before);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a full scaffold needs no regeneration, so the payload matches what is generated", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      // Opt-in folders are named explicitly: every guard has to hold for the payload to match.
      const everyFolder = await readTemplateFolders(join(templateRoot(), ".ai"));
      await runInit([target, "-y", "--folders", everyFolder.join(",")]);

      for (const relative of [".ai/_index.md", ".ai/skills/_index.md", "AGENTS.md"]) {
        const shipped = applyRequirements(
          await readFile(join(templateRoot(), relative), "utf8"),
          () => true,
        );
        const written = await readFile(join(target, relative), "utf8");
        assert.equal(written, shipped, `${relative} drifted from the shipped payload`);
      }
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("no guard comment ever reaches a scaffolded repository", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--folders", "context,skills", "--skills", "adding-context"]);

      for (const relative of await scaffoldedMarkdown(target)) {
        const content = await readFile(join(target, relative), "utf8");
        assert.doesNotMatch(content, /agent-generated:requires/, `${relative} kept a guard`);
      }
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("declining a folder leaves nothing pointing at it", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--folders", "context,prompts,skills"]);
      assert.equal(existsSync(join(target, ".ai", "templates")), false);

      for (const relative of await scaffoldedMarkdown(target)) {
        const content = await readFile(join(target, relative), "utf8");
        assert.doesNotMatch(content, /\.ai\/templates\//, `${relative} still points at templates/`);
      }
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("declining skills leaves the context index pointing at no skill", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-test-"));
    try {
      await runInit([target, "-y", "--folders", "context,templates"]);

      const contextIndex = await readFile(join(target, ".ai", "context", "_index.md"), "utf8");
      assert.doesNotMatch(contextIndex, /adding-context/, "a declined skill must not be referenced");
      assert.match(contextIndex, /Keep each fact in exactly one file/, "the rest of the prose stays");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("markdown wrap setting", () => {
  /** Plans a skills-only scaffold and returns the docs skill it would write. */
  async function docsSkillFor(wrap?: string, chosenOptions?: readonly string[]): Promise<string> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-wrap-"));
    try {
      const plan = await planScaffold({
        target,
        folderName: ".ai",
        updateGitignore: false,
        createClaudeMd: false,
        folders: ["skills"],
        skills: ["writing-project-docs"],
        ...(wrap === undefined ? {} : { wrap }),
        ...(chosenOptions === undefined ? {} : { chosenOptions }),
      });
      const file = plan.find((entry) => entry.relativePath.endsWith("writing-project-docs/SKILL.md"));
      assert.ok(file, "expected the docs skill to be planned");
      return file.contents.toString("utf8");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("names npx unless the uv option is chosen, and only one command either way", async () => {
    const npx = await docsSkillFor();
    assert.match(npx, /npx prettier@3 --prose-wrap always --print-width 160 --write/);
    assert.doesNotMatch(npx, /uvx/);

    const uv = await docsSkillFor(undefined, ["uv-formatter"]);
    assert.match(uv, /uvx --with mdformat-gfm mdformat --wrap 160 <file>/);
    assert.doesNotMatch(uv, /npx/);

    const uvNoReflow = await docsSkillFor("no-reflow", ["uv-formatter"]);
    assert.match(uvNoReflow, /uvx --with mdformat-gfm mdformat --wrap no <file>/);
    assert.doesNotMatch(uvNoReflow, /\{mdformat-wrap\}/);
  });

  test("states the default width when nothing asks for another", async () => {
    const skill = await docsSkillFor();
    assert.match(skill, /Wrap prose at 160 columns/);
    assert.match(skill, /--print-width 160/);
    assert.doesNotMatch(skill, /Do not hard-wrap/);
  });

  test("substitutes a chosen width everywhere it appears", async () => {
    const skill = await docsSkillFor("100");
    assert.match(skill, /Wrap prose at 100 columns/);
    assert.match(skill, /--print-width 100 --write/);
    assert.doesNotMatch(skill, /\{wrap-columns\}/);
  });

  test("states the other wording under no-reflow, and leaves no placeholder behind", async () => {
    const skill = await docsSkillFor("no-reflow");
    assert.match(skill, /Do not hard-wrap prose/);
    assert.match(skill, /--prose-wrap never --print-width 400/);
    assert.doesNotMatch(skill, /Wrap prose at/);
    assert.doesNotMatch(skill, /\{wrap-columns\}/);
  });
});

describe("commit prefixes", () => {
  /** Plans a git-flow-only scaffold and returns the skill it would write. */
  async function gitFlowFor(chosenOptions: readonly string[]): Promise<string> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-prefixes-"));
    try {
      const plan = await planScaffold({
        target,
        folderName: ".ai",
        updateGitignore: false,
        createClaudeMd: false,
        folders: ["skills"],
        skills: ["git-flow"],
        chosenOptions,
      });
      const file = plan.find((entry) => entry.relativePath.endsWith("git-flow/SKILL.md"));
      assert.ok(file, "expected git-flow to be planned");
      return file.contents.toString("utf8");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("states Conventional Commits unless the project keeps its own prefixes", async () => {
    const conventional = await gitFlowFor([]);
    assert.match(conventional, /Conventional Commits/);
    assert.match(conventional, /feat\(cli\)/);
    assert.doesNotMatch(conventional, /feature\(api\)/, "only one vocabulary survives");

    const own = await gitFlowFor(["project-prefixes"]);
    assert.match(own, /feature\(api\)/);
    assert.doesNotMatch(own, /feat\(cli\)/);
  });

  test("leaves no guard behind, whichever vocabulary was written", async () => {
    for (const chosen of [[], ["project-prefixes"]]) {
      const skill = await gitFlowFor(chosen);
      assert.doesNotMatch(skill, /agent-generated:requires/);
      assert.equal(skill.match(/### 1\. Subject line/g)?.length, 1);
      assert.match(skill, /BREAKING CHANGE:/, "the breaking-change rule is not tied to a vocabulary");
      assert.match(skill, /\*\*Scope\*\* is the area/);
    }
  });
});

describe("workspace boundary", () => {
  /** Every path a full scaffold would write, relative to the target. */
  async function plannedPaths(folderName: string): Promise<string[]> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-boundary-"));
    try {
      const plan = await planScaffold({
        target,
        folderName,
        projectAbout: "A project.",
        updateGitignore: true,
        createClaudeMd: true,
        chosenOptions: ["agent-info", "no-gpg-sign", "project-prefixes", "uv-formatter", "formatter-config"],
      });
      return plan.map((entry) => entry.relativePath);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("writes only AGENTS.md, CLAUDE.md and .gitignore outside the AI folder", async () => {
    for (const folderName of [".ai", ".agent"]) {
      const outside = (await plannedPaths(folderName))
        .filter((path) => !path.startsWith(`${folderName}/`))
        .sort();
      assert.deepEqual(
        outside,
        [".gitignore", "AGENTS.md", "CLAUDE.md"],
        `a scaffold into ${folderName} may touch nothing else outside it`,
      );
    }
  });
});

describe("formatter config", () => {
  /** The formatter config a scaffold would write, if it would write one at all. */
  async function configFor(
    chosenOptions: readonly string[],
    extra: { wrap?: string; folderName?: string; skills?: readonly string[] } = {},
  ): Promise<{ path: string; contents: string } | undefined> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-fmt-"));
    try {
      const plan = await planScaffold({
        target,
        folderName: extra.folderName ?? ".ai",
        updateGitignore: false,
        createClaudeMd: false,
        folders: ["skills"],
        skills: extra.skills ?? ["writing-project-docs"],
        chosenOptions,
        ...(extra.wrap === undefined ? {} : { wrap: extra.wrap }),
      });
      const file = plan.find((entry) => /\.(prettierrc|mdformat\.toml)$/.test(entry.relativePath));
      return file ? { path: file.relativePath, contents: file.contents.toString("utf8") } : undefined;
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("writes nothing unless the developer asks for it", async () => {
    assert.equal(await configFor([]), undefined);
    assert.equal(await configFor(["uv-formatter"]), undefined);
  });

  test("writes it inside the AI folder, never beside it", async () => {
    const written = await configFor(["formatter-config"], { folderName: ".agent" });
    assert.equal(written?.path, join(".agent", ".prettierrc"));
  });

  test("configures the formatter that was chosen", async () => {
    const prettier = await configFor(["formatter-config"]);
    assert.match(prettier?.path ?? "", /\.prettierrc$/);
    assert.match(prettier?.contents ?? "", /"printWidth": 160/);

    const mdformat = await configFor(["formatter-config", "uv-formatter"]);
    assert.match(mdformat?.path ?? "", /\.mdformat\.toml$/);
    assert.match(mdformat?.contents ?? "", /^wrap = 160$/m);
  });

  test("carries the same answer the command carries", async () => {
    const prettier = await configFor(["formatter-config"], { wrap: "no-reflow" });
    assert.match(prettier?.contents ?? "", /"proseWrap": "never"/);
    assert.match(prettier?.contents ?? "", /"printWidth": 400/, "tables stay aligned when prose is not wrapped");

    const mdformat = await configFor(["formatter-config", "uv-formatter"], { wrap: "no-reflow" });
    assert.match(mdformat?.contents ?? "", /^wrap = "no"$/m);
  });

  test("writes nothing when the skill that owns the convention was not installed", async () => {
    assert.equal(await configFor(["formatter-config"], { skills: ["git-flow"] }), undefined);
  });
});

describe("the commands folder", () => {
  /** Scaffolds into a temporary target and reports what landed. */
  async function scaffold(argv: readonly string[]): Promise<{ folders: string[]; skills: string[]; agents: string }> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-commands-"));
    try {
      assert.equal(await runInit([target, "-y", ...argv]), ExitCode.Success);
      return {
        folders: (await readdir(join(target, ".ai"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
        skills: (await readdir(join(target, ".ai", "skills"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
        agents: await readFile(join(target, "AGENTS.md"), "utf8"),
      };
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("is offered but not scaffolded by default", async () => {
    const written = await scaffold([]);
    assert.ok(!written.folders.includes("commands"), "an empty command table teaches an agent nothing");
    assert.ok(!written.skills.includes("adding-commands"), "nor does guidance for a folder that is absent");
    assert.doesNotMatch(written.agents, /commands\/_index\.md/);
  });

  test("brings its skill and its directive when it is selected", async () => {
    const written = await scaffold(["--folders", "context,skills,commands"]);
    assert.ok(written.folders.includes("commands"));
    assert.ok(written.skills.includes("adding-commands"));
    assert.match(written.agents, /Before running a project command/);
  });

  test("leaves no scaffolder field in the installed skill", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-commands-"));
    try {
      await runInit([target, "-y", "--folders", "skills,commands"]);
      const skill = await readFile(join(target, ".ai", "skills", "adding-commands", "SKILL.md"), "utf8");
      assert.doesNotMatch(skill, /requires-folder/, "the field configures the scaffolder, not the agent");
      assert.match(skill, /name: adding-commands/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("the handoffs folder", () => {
  /** Scaffolds into a temporary target and reports what landed. */
  async function scaffold(argv: readonly string[]): Promise<{ folders: string[]; skills: string[]; agents: string; gitFlow: string }> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-handoffs-"));
    try {
      assert.equal(await runInit([target, "-y", ...argv]), ExitCode.Success);
      return {
        folders: (await readdir(join(target, ".ai"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
        skills: (await readdir(join(target, ".ai", "skills"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
        agents: await readFile(join(target, "AGENTS.md"), "utf8"),
        gitFlow: await readFile(join(target, ".ai", "skills", "git-flow", "SKILL.md"), "utf8"),
      };
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("is offered but not scaffolded by default", async () => {
    const written = await scaffold([]);
    assert.ok(!written.folders.includes("handoffs"), "an empty handoffs folder hands nothing over");
    assert.ok(!written.skills.includes("handoff"), "nor does guidance for a folder that is absent");
    assert.doesNotMatch(written.agents, /handoffs\/_index\.md/);
    assert.doesNotMatch(written.gitFlow, /Prune the handoff/, "nothing to prune without the folder");
  });

  test("brings its skill, its directive and the prune rule when it is selected", async () => {
    const written = await scaffold(["--folders", "context,skills,handoffs"]);
    assert.ok(written.folders.includes("handoffs"));
    assert.ok(written.skills.includes("handoff"));
    assert.match(written.agents, /handoffs\/_index\.md/);
    assert.match(written.gitFlow, /Prune the handoff/);
  });
});

describe("the environments folder", () => {
  /** Scaffolds into a temporary target and reads back what points at the profiles. */
  async function scaffold(argv: readonly string[]): Promise<{ folders: string[]; agents: string; environment: string; addingContext: string }> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-environments-"));
    try {
      assert.equal(await runInit([target, "-y", ...argv]), ExitCode.Success);
      return {
        folders: (await readdir(join(target, ".ai"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
        agents: await readFile(join(target, "AGENTS.md"), "utf8"),
        environment: await readFile(join(target, ".ai", "context", "environment.md"), "utf8"),
        addingContext: await readFile(join(target, ".ai", "skills", "adding-context", "SKILL.md"), "utf8"),
      };
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("is offered but not scaffolded by default", async () => {
    const written = await scaffold([]);
    assert.ok(!written.folders.includes("environments"), "one machine setup needs no profiles");
    assert.doesNotMatch(written.agents, /\.ai\/environments\//, "no directive for a folder that is absent");
    assert.doesNotMatch(written.environment, /environments\//);
    assert.doesNotMatch(written.addingContext, /environments\//);
  });

  test("brings the profile directive and the setup procedure when it is selected", async () => {
    const written = await scaffold(["--folders", "context,skills,environments"]);
    assert.ok(written.folders.includes("environments"));
    assert.match(written.agents, /names a profile in `\.ai\/environments\/`/);
    assert.match(written.environment, /This machine: environments\/macos-sandbox\.md/);
    assert.match(written.addingContext, /To set up a machine/);
  });
});

describe("the developer's local guide", () => {
  test("is read from inside the AI folder, where the local pattern keeps it out of git", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-local-guide-"));
    try {
      assert.equal(await runInit([target, "-y", "--folder", ".agents"]), ExitCode.Success);
      const agents = await readFile(join(target, "AGENTS.md"), "utf8");
      assert.match(agents, /If `\.agents\/AGENTS\.local\.md` exists/);
      assert.doesNotMatch(agents, /at the repository root/);
      assert.match(await readFile(join(target, ".agents", ".gitignore"), "utf8"), /^\*\.local\.md$/m);
      assert.ok(isIndexed("AGENTS.local.md", true) === false, "an index row would link a file other machines do not have");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("the folder menu", () => {
  test("carries a hint for every shipped folder", async () => {
    for (const folder of await readTemplateFolders(join(templateRoot(), ".ai"))) {
      assert.ok(FOLDER_HINTS[folder], `${folder}/ is offered with no hint saying what it holds`);
    }
  });
});

describe("the research folder and the phase skills", () => {
  /** Scaffolds into a temporary target and reads back what the phase skills say. */
  async function scaffold(argv: readonly string[]): Promise<{ folders: string[]; skills: string[]; research: string; design: string }> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-research-"));
    try {
      assert.equal(await runInit([target, "-y", ...argv]), ExitCode.Success);
      return {
        folders: (await readdir(join(target, ".ai"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
        skills: (await readdir(join(target, ".ai", "skills"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
        research: await readFile(join(target, ".ai", "skills", "research", "SKILL.md"), "utf8"),
        design: await readFile(join(target, ".ai", "skills", "design", "SKILL.md"), "utf8"),
      };
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("the folder is offered but not scaffolded, and the phase skills are installed anyway", async () => {
    const written = await scaffold([]);
    assert.ok(!written.folders.includes("research"), "an empty folder of surveys teaches an agent nothing");
    for (const skill of ["research", "design", "implement"]) {
      assert.ok(written.skills.includes(skill), `the ${skill} phase is worth following without its folder`);
    }
  });

  test("the research skill points at the project's own docs until the folder exists", async () => {
    const without = await scaffold([]);
    assert.match(without.research, /Write into this project's documentation tree/);
    assert.doesNotMatch(without.research, /Write into `\.\.\/\.\.\/research\/`/);

    const with_ = await scaffold(["--folders", "research,skills,templates"]);
    assert.ok(with_.folders.includes("research"));
    assert.match(with_.research, /Write into `\.\.\/\.\.\/research\/`/);
    assert.doesNotMatch(with_.research, /Write into this project's documentation tree/);
  });

  test("the design skill names the spec tree only once that folder is scaffolded", async () => {
    const written = await scaffold([]);
    assert.doesNotMatch(written.design, /specs\/_index\.md/, "the guard holds until the spec tree ships");
    assert.match(written.design, /Read the index of wherever this project keeps its specs/);
  });
});

describe("the spec tree", () => {
  /** Scaffolds into a temporary target and reads back the tree and the skills that name it. */
  async function scaffold(argv: readonly string[]): Promise<{ folders: string[]; specFiles: string[]; design: string; implement: string }> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-specs-"));
    try {
      assert.equal(await runInit([target, "-y", ...argv]), ExitCode.Success);
      const specs = join(target, ".ai", "specs");
      return {
        folders: (await readdir(join(target, ".ai"), { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name),
        specFiles: existsSync(specs) ? (await readdir(specs)).sort() : [],
        design: await readFile(join(target, ".ai", "skills", "design", "SKILL.md"), "utf8"),
        implement: await readFile(join(target, ".ai", "skills", "implement", "SKILL.md"), "utf8"),
      };
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("is offered but not scaffolded by default", async () => {
    const written = await scaffold([]);
    assert.ok(!written.folders.includes("specs"));
  });

  test("arrives holding only its index, since the grouping is the project's own", async () => {
    const written = await scaffold(["--folders", "skills,specs,templates"]);
    assert.deepEqual(written.specFiles, ["_index.md"], "no group is written before there are specs to put in it");
  });

  test("the design and implement skills name the tree once it exists", async () => {
    const written = await scaffold(["--folders", "skills,specs,templates"]);
    assert.match(written.design, /\.\.\/\.\.\/specs\/_index\.md/);
    assert.match(written.implement, /\.\.\/\.\.\/specs\//);
    assert.doesNotMatch(written.design, /wherever this project keeps its specs/, "exactly one branch of the guard survives");
  });
});

describe("what the always-loaded file carries", () => {
  /** Scaffolds a full tree and reads back the guide, the docs skill and the phase skills. */
  async function scaffold(): Promise<{ agents: string; docsSkill: string; phases: Record<string, string> }> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-budget-"));
    try {
      const everyFolder = await readTemplateFolders(join(templateRoot(), ".ai"));
      assert.equal(await runInit([target, "-y", "--folders", everyFolder.join(",")]), ExitCode.Success);
      const phases: Record<string, string> = {};
      for (const phase of ["research", "design", "implement", "handoff"]) {
        phases[phase] = await readFile(join(target, ".ai", "skills", phase, "SKILL.md"), "utf8");
      }
      return {
        agents: await readFile(join(target, "AGENTS.md"), "utf8"),
        docsSkill: await readFile(join(target, ".ai", "skills", "writing-project-docs", "SKILL.md"), "utf8"),
        phases,
      };
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  test("index procedure lives in the skill, not in the guide every session loads", async () => {
    const written = await scaffold();
    for (const procedure of [/Fully generate the \*\*Index table\*\*/, /Do not change the section order/, /Keep indexes navigational/]) {
      assert.doesNotMatch(written.agents, procedure, "procedure belongs in the skill that is read when it applies");
      assert.match(written.docsSkill, procedure, "and it must survive the move rather than be deleted");
    }
  });

  test("the guide still says where to start, so the indexes can direct the rest", async () => {
    const written = await scaffold();
    assert.match(written.agents, /Read a folder's index before working in it/);
    assert.match(written.agents, /Every folder under `\.ai\/` has an `_index\.md`/);
  });

  test("every phase skill carries the one instruction an index cannot give", async () => {
    const written = await scaffold();
    for (const [phase, body] of Object.entries(written.phases)) {
      assert.match(body, /Open what this phase names and follow the indexes from there/, `${phase} does not say when to stop reading`);
    }
  });
});

describe("the spec migration skills", () => {
  /** Scaffolds with the given folders and reports which skills landed. */
  async function skillsFor(folders: string): Promise<string[]> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-migrate-"));
    try {
      assert.equal(await runInit([target, "-y", "--folders", folders]), ExitCode.Success);
      return (await readdir(join(target, ".ai", "skills"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  const MIGRATIONS = [
    "migrate-specs-from-openspec",
    "migrate-specs-from-spec-kit",
    "migrate-specs-to-openspec",
    "migrate-specs-to-spec-kit",
  ];

  test("stay out of a scaffold that declined the spec tree", async () => {
    const skills = await skillsFor("context,skills,templates");
    for (const skill of MIGRATIONS) {
      assert.ok(!skills.includes(skill), `${skill} converts a tree that is not there`);
    }
  });

  test("arrive with the spec tree, in both directions", async () => {
    const skills = await skillsFor("skills,specs,templates");
    for (const skill of MIGRATIONS) {
      assert.ok(skills.includes(skill), `${skill} is missing`);
    }
  });

  test("the spec template carries the requirement and scenario shape the frameworks validate", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-migrate-"));
    try {
      await runInit([target, "-y", "--folders", "specs,templates"]);
      const template = await readFile(join(target, ".ai", "templates", "spec.template.md"), "utf8");
      assert.match(template, /### Requirement: /);
      assert.match(template, /#### Scenario: /);
      assert.match(template, /SHALL/, "a requirement has to state behaviour a reader can check");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("whether the AI folder reaches another machine", () => {
  test("is committed by default, since it holds the handoffs, specs and research a next session needs", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-vcs-"));
    try {
      assert.equal(await runInit([target, "-y", "--folders", "handoffs,skills,specs"]), ExitCode.Success);
      assert.equal(existsSync(join(target, ".gitignore")), false);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("is still ignorable on request, and the machine-local file stays local either way", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-vcs-"));
    try {
      assert.equal(await runInit([target, "-y", "--gitignore"]), ExitCode.Success);
      assert.match(await readFile(join(target, ".gitignore"), "utf8"), /\.ai\//);
      assert.match(await readFile(join(target, ".ai", ".gitignore"), "utf8"), /\*\.local\.md/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("skills that load in every session", () => {
  const read = async (target: string, file: string): Promise<string> => readFile(join(target, file), "utf8");

  test("nothing loads by default, and CLAUDE.md stays the one-line pointer", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-autoload-"));
    try {
      assert.equal(await runInit([target, "-y", "--folders", "skills"]), ExitCode.Success);
      assert.equal(await read(target, "CLAUDE.md"), "@AGENTS.md\n");
      assert.match(await read(target, "AGENTS.md"), /No skill is applied in every session/);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("an update leaves the one-line pointer alone when nothing loads", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-autoload-"));
    try {
      assert.equal(await runInit([target, "-y", "--folders", "skills"]), ExitCode.Success);
      assert.equal(await runInit([target, "-y", "--update"]), ExitCode.Success);
      assert.equal(await read(target, "CLAUDE.md"), "@AGENTS.md\n", "a re-run must not add an empty region a fresh run leaves out");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a chosen skill is imported by CLAUDE.md and named in AGENTS.md", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-autoload-"));
    try {
      const code = await runInit([target, "-y", "--folders", "skills", "--skills", "git-flow", "--autoload", "git-flow"]);
      assert.equal(code, ExitCode.Success);
      assert.match(await read(target, "CLAUDE.md"), /^@\.ai\/skills\/git-flow\/SKILL\.md$/m, "the import is what actually loads it");
      assert.match(await read(target, "AGENTS.md"), /Apply .*git-flow.*in every session/, "and a portable sentence for harnesses that expand nothing");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a chosen tool loads like a skill, and an update keeps it", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-autoload-"));
    try {
      const code = await runInit([target, "-y", "--folders", "skills", "--skills", "none", "--tools", "rtk", "--autoload", "rtk"]);
      assert.equal(code, ExitCode.Success, "a tool installs a skill under its own name, so it is loadable");
      assert.match(await read(target, "CLAUDE.md"), /^@\.ai\/skills\/rtk\/SKILL\.md$/m);
      assert.match(await read(target, "AGENTS.md"), /Apply .*rtk.*in every session/);

      assert.equal(await runInit([target, "-y", "--update"]), ExitCode.Success);
      assert.match(await read(target, "CLAUDE.md"), /^@\.ai\/skills\/rtk\/SKILL\.md$/m, "a re-run must not drop a loaded tool");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("refuses a skill that was not installed", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-autoload-"));
    try {
      await assert.rejects(
        () => runInit([target, "-y", "--folders", "skills", "--skills", "git-flow", "--autoload", "humanizer"]),
        UsageError,
        "loading a skill that is not there would be silent",
      );
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test("a re-run rewrites only the generated region of CLAUDE.md", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-autoload-"));
    try {
      await runInit([target, "-y", "--folders", "skills", "--skills", "git-flow", "--autoload", "git-flow"]);
      const kept = "\n## My own notes\n\nKeep this.\n";
      await writeFile(join(target, "CLAUDE.md"), (await read(target, "CLAUDE.md")) + kept);

      assert.equal(
        await runInit([target, "-y", "--folders", "skills", "--skills", "git-flow", "--autoload", "none"]),
        ExitCode.Success,
      );
      const updated = await read(target, "CLAUDE.md");
      assert.ok(updated.includes(kept), "a developer's own lines survive the rewrite");
      assert.doesNotMatch(updated, /@\.ai\/skills\/git-flow/, "and the region itself is current");
      assert.match(updated, /^@AGENTS\.md$/m);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("environment context", () => {
  /** Scaffolds a target holding the given root files, and returns a reader for what landed. */
  async function withScaffold(
    rootFiles: Record<string, string>,
    argv: readonly string[],
    check: (target: string) => Promise<void>,
  ): Promise<void> {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-env-"));
    try {
      for (const [name, contents] of Object.entries(rootFiles)) {
        await writeFile(join(target, name), contents, "utf8");
      }
      assert.equal(await runInit([target, "-y", ...argv]), ExitCode.Success);
      await check(target);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }

  const manifest = JSON.stringify({ packageManager: "pnpm@11.21.0", scripts: { test: "node --test" } });

  test("ships by default, with the toolchain detected from the target", async () => {
    await withScaffold({ "package.json": manifest }, [], async (target) => {
      const environment = await readFile(join(target, ".ai", "context", "environment.md"), "utf8");
      assert.match(environment, /\| pnpm 11\.21\.0 \|/);
      assert.match(environment, /`pnpm test`/);
      assert.doesNotMatch(environment, /Nothing detected yet/);
    });
  });

  test("puts the developer's constraints where the placeholder was, and nowhere else", async () => {
    await withScaffold({}, ["--environment", "No Docker; services run on the host."], async (target) => {
      const environment = await readFile(join(target, ".ai", "context", "environment.md"), "utf8");
      assert.match(environment, /## Constraints\n\nNo Docker; services run on the host\.\n/);
      assert.match(environment, /## Deployed environments\n\n<placeholder>/, "the table still asks to be filled in");
    });
  });

  test("keeps a machine-local file out of git and out of the index", async () => {
    await withScaffold({}, [], async (target) => {
      const ignore = await readFile(join(target, ".ai", ".gitignore"), "utf8");
      assert.match(ignore, /^\*\.local\.md$/m);

      await writeFile(join(target, ".ai", "context", "environment.local.md"), "# This machine\n", "utf8");
      assert.equal(await runInit([target, "-y", "--update"]), ExitCode.Success);
      const index = await readFile(join(target, ".ai", "context", "_index.md"), "utf8");
      assert.doesNotMatch(index, /environment\.local\.md/, "a row for a file only one machine has would be a dead link");
      assert.doesNotMatch(await readFile(join(target, ".ai", "_index.md"), "utf8"), /\.gitignore/);
    });
  });

  test("points AGENTS.md at the local file, and drops the pointer when context is declined", async () => {
    await withScaffold({}, [], async (target) => {
      assert.match(await readFile(join(target, "AGENTS.md"), "utf8"), /environment\.local\.md/);
    });
    await withScaffold({}, ["--folders", "skills"], async (target) => {
      assert.doesNotMatch(await readFile(join(target, "AGENTS.md"), "utf8"), /environment\.local\.md/);
      assert.ok(!existsSync(join(target, ".ai", ".gitignore")), "no slot, so nothing to ignore");
    });
  });

  test("refreshes the detected region on a later run, leaving the prose alone", async () => {
    await withScaffold({ "package.json": manifest }, ["--environment", "Kept."], async (target) => {
      const next = JSON.stringify({ packageManager: "pnpm@11.21.0", scripts: { test: "node --test", lint: "eslint ." } });
      await writeFile(join(target, "package.json"), next, "utf8");
      assert.equal(await runInit([target, "-y", "--update"]), ExitCode.Success);
      const environment = await readFile(join(target, ".ai", "context", "environment.md"), "utf8");
      assert.match(environment, /`pnpm lint`/, "a script added after the first run is picked up");
      assert.match(environment, /## Constraints\n\nKept\./);
    });
  });
});

describe("a sandbox description linked in as the local file", () => {
  test("is read through the link, and still kept out of the index", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-sandbox-"));
    const elsewhere = await mkdtemp(join(tmpdir(), "ai-scaffold-sandbox-doc-"));
    try {
      assert.equal(await runInit([target, "-y"]), ExitCode.Success);
      const description = join(elsewhere, "sandbox.md");
      await writeFile(description, "# Sandbox\n\nThere is no Docker in here.\n", "utf8");
      await symlink(description, join(target, ".ai", "context", "environment.local.md"));

      assert.equal(await runInit([target, "-y", "--update"]), ExitCode.Success);
      const index = await readFile(join(target, ".ai", "context", "_index.md"), "utf8");
      assert.doesNotMatch(index, /environment\.local\.md/, "a symlink is not a regular file, so it must be skipped by name");
    } finally {
      await rm(target, { recursive: true, force: true });
      await rm(elsewhere, { recursive: true, force: true });
    }
  });
});
