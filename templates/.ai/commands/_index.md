# Commands index

**Purpose.** How this project's commands must actually be invoked, when the correct invocation is not the obvious one. The **Commands** table below is the
artifact; read it before running a build, a test, a deploy or any project tool.

**Not for.** What the project is or expects, which belongs in [`context/environment.md`](../context/environment.md), and workflows an agent follows when a task
matches, which belong in [`skills/`](../skills/_index.md). This folder answers one question only: what do I type.

**Conventions.**

- One row per command. A row that needs more than a sentence of explanation graduates to its own file, and the row links to it.
- Fill in **Never** and **Why**. Without them an agent reaches for the obvious invocation and rediscovers the failure.
- A command whose arguments vary goes behind a fixed entry point, so it can be approved once instead of on every run.
- A script a human would run anyway belongs in the project's own scripts directory; a script that exists only to give an agent a stable entry point belongs in
  `bin/` here. Record the path either way.

## Index

<!-- BEGIN agent-generated:index-table -->

| File | Status   | Summary                                                                 |
| ---- | -------- | ----------------------------------------------------------------------- |
| —    | Reserved | No command has needed a file of its own yet; the table below holds them. |

<!-- END agent-generated:index-table -->

## Commands

<placeholder>Replace these rows with this project's commands, and delete any that do not apply. An empty table teaches an agent nothing; a wrong one
teaches it something false.</placeholder>

| Command | Use this                                 | Never          | Why                                                        |
| ------- | ---------------------------------------- | -------------- | ---------------------------------------------------------- |
| Build   | <placeholder>`./gradlew build`</placeholder> | `gradle build` | <placeholder>the plain binary misses the init script</placeholder> |
