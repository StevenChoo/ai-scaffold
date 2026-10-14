#!/usr/bin/env node

/**
 * `ai-scaffold` command-line entry point.
 *
 * This file owns process concerns only: parse arguments, dispatch, render an error, and choose an exit code. Command
 * behavior lives under `commands/` so it can be tested without spawning a process.
 */

import process from "node:process";

import { packageVersion, runInit } from "./commands/init.js";
import { ExitCode, UsageError } from "./result.js";

const USAGE = `ai-scaffold — add agent-facing structure to a repository

Usage:
  ai-scaffold init [target]     Scaffold AGENTS.md and .ai/ into a target repository
  ai-scaffold --help            Show this message
  ai-scaffold --version         Show the version

Arguments:
  target                        Directory to scaffold (defaults to current directory).

Options:
  --config <path>               YAML file answering these questions ahead of time. Defaults to
                                "ai-scaffold.yaml" or "ai-scaffold.yml" in the target, when
                                present, for a first scaffold only: beside an existing install
                                a file found this way stops the run. A flag always beats the file.
  --folder, --folder-name <name> Name for the AI tool directory (default: ".ai").
  --about, --description <text>  Initial description for project context (project.md).
  --environment <text>          Project constraints for the environment context file.
  --folders <a,b,c>             Folders to scaffold under the AI directory, or "none".
                                Defaults to all.
  --skills <a,b,c>              Skills to install, or "none". Names this repository's own
                                skills and external ones alike. Defaults to our own only;
                                an external skill is installed when it is named.
  --no-skills                   Install no skills.
  --tools <a,b,c>               External tools to install, or "none". Defaults to none.
  --no-tools                    Install no tools.
  --options <a,b,c>             Enable options the selected skills offer, or "none".
                                Every option is off unless named here.
  --extras <a,b,c>              Bundled extras to install, or "none". A provider's core skill
                                is always installed; its extras never are unless named.
  --no-extras                   Install no bundled extras.
  --wrap <columns|no-reflow>    Markdown prose width the written convention states
                                (default: 160). "no-reflow" asks for one line per paragraph.
  --autoload <a,b,c>            Installed skills to load in every session, or "none".
                                Defaults to none on a first scaffold, to what is loaded on a re-run.
  --no-autoload                 Load no skill in every session.
  --gitignore                   Update .gitignore to exclude the AI directory (default: false).
  --no-gitignore                Do not update .gitignore.
  --track-version               Record the ai-scaffold version in the AI directory, in
                                .ai-scaffold.version (default: true). An update never writes it.
  --no-track-version            Do not record the version.
  --claude-md                   Create CLAUDE.md referencing @AGENTS.md (default: true).
  --no-claude-md                Do not create CLAUDE.md.
  -y, --yes                     Skip interactive prompts and accept all defaults.
  --update                      For a target that already has agent tooling: add only what is
                                missing and leave existing files untouched. Default when
                                an existing install is detected non-interactively.
  --fresh, --rescaffold         For a target that already has agent tooling: replace every
                                scaffold file with the shipped version.
  --backup                      First copy the current setup into .scaffold-backup inside
                                the AI directory (default: true with --fresh, asked on update).
  --no-backup                   Replace or update without keeping a copy.
  --migrate-instructions        With a backup: add AGENT_AISCAFFOLD_MIGRATE_INSTRUCTIONS.md,
                                telling an agent how to migrate it (default: true).
  --no-migrate-instructions     Keep the backup without instructions.
  --force                       Overwrite files that already exist. Implies --fresh.
  --dry-run                     Report what would be written without writing anything.

When the target already contains an AI folder or an AGENTS.md, init reports what it found and
asks whether to update or re-scaffold. Neither mode deletes files the scaffold does not ship;
an unticked folder or skill is removed only when none of its files were changed.

As its last step, init regenerates every _index.md table and the skill directives in AGENTS.md
from the files that are actually present, so both describe the tree that exists.
`;

async function main(argv: readonly string[]): Promise<ExitCode> {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return ExitCode.Success;
  }

  if (command === "--version" || command === "-v") {
    process.stdout.write(`${await packageVersion()}\n`);
    return ExitCode.Success;
  }

  switch (command) {
    case "init":
      return await runInit(rest);
    default:
      throw new UsageError(`unknown command ${JSON.stringify(command)}`);
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    process.stderr.write(`error: ${error.message}\n\n${USAGE}`);
    process.exitCode = ExitCode.Usage;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n`);
    process.exitCode = ExitCode.Failure;
  }
}
