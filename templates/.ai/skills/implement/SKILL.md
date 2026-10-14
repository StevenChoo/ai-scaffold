---
name: implement
description: >-
  Build an approved specification one task at a time, stopping at anything that needs a decision. Use when asked to
  implement a spec, work through a task list, or continue an implementation already under way.
---

# Implementing an approved spec

This phase answers "does it work". Its input is an approved spec and its tasks; its output is working code, committed.

## Before starting

<!-- agent-generated:requires specs/_index.md -->
Read the spec in [`../../specs/`](../../specs/_index.md) and the task file beside it. A spec still marked `Draft` or `Proposed` has not been approved: ask
before building it.

<!-- agent-generated:requires !specs/_index.md -->
Read the spec wherever this project keeps it, and the task list beside it. A spec that has not been approved is not ready to build: ask before starting.

Read the environment and command notes this project keeps, so the build and test commands are the project's own rather than the obvious ones.

Open what this phase names and follow the indexes from there. A document this phase does not name is a document it does not need.

## Working

- One task at a time, in order. Mark a task done when it is done, not when it is started.
- Commit each finished task, following this project's git workflow.
- Keep the spec true: if the work proves the spec wrong, stop and say so rather than building something the spec does not describe.
- Do not widen the work. A task that turns out to need a second task gets the second task written down, not absorbed.
- **Record an approach that failed.** An abandoned attempt leaves no trace but a deleted branch, so the next session tries it again. Put it where it will be
  met: a boundary the spec should have had goes in its **Out of scope**, a trap belongs with the durable project notes, and anything smaller goes in the body of
  the commit that replaced it.

## The verdict

Stop at the first task that cannot be finished without a decision, and say which decision is needed. Finishing the other tasks first is right; guessing at the
missing one is not. The phase ends when every task is done or the remaining ones are blocked and named.
