---
name: adding-commands
description: >-
  Record how a project command must be invoked, in .ai/commands/. Use when a command needs a prefix, a wrapper or a flag
  that is not obvious, when an agent keeps being asked to approve the same command with different arguments, or when a
  recorded command has changed.
agents-md: Before recording or changing how a project command is invoked, read and follow {skill}.
requires-folder: commands
---

# Recording a project command

A row in [`../../commands/_index.md`](../../commands/_index.md) exists for one reason: the obvious invocation is wrong, and an agent that does not read the row
will use it anyway. Everything here follows from that.

## Decide whether it belongs here at all

- **The obvious command works.** Nothing to record. A table of commands that behave normally is noise that pushes the real entries out of sight.
- **The command needs a prefix, a wrapper, a flag or an environment variable.** Record it.
- **The command is destructive, or an agent must never run it.** Record it, with the row saying so. The negative entry is worth as much as the positive one.

## Write the row

| Column       | What goes in it                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Command**  | What a person would call the task: Build, Test, Deploy, Migrate.                                      |
| **Use this** | The exact invocation, copy-pasteable, with a placeholder for anything that varies.                    |
| **Never**    | The invocation an agent would otherwise reach for.                                                    |
| **Why**      | What goes wrong. One clause, concrete: what fails, or what it damages.                                |

Leaving **Never** and **Why** empty is the common failure. "Use `./gradlew`" does not survive contact with a session that has already typed `gradle`; "`gradle`
misses the init script and fails on configuration" does.

## Commands whose arguments change

An agent is asked to approve a command each time its arguments differ, because an approval matches a command line and not an intent. Documentation cannot fix
that. A fixed entry point can: wrap the varying part in a script, record the script, and the approval is reusable.

- A script a human would run anyway — build, deploy, database migration — lives in the project's own scripts directory. Record its path in the row.
- A script that exists only so an agent has a stable command lives in `bin/` beside this folder's index. Keep it small, keep its arguments few, and make it fail
  loudly rather than guess.

Never create a wrapper for a command that already takes stable arguments. It adds a file, a name to remember, and nothing else.

## Keep it true

- Change the row in the same commit that changes the command. A stale row is worse than a missing one: an agent will follow it.
- Read the table before adding to it. A command already recorded gets an updated row, never a second one.
- A row that outgrows a sentence becomes its own file in this folder, and the row links to it. Do not let the table turn into prose.
