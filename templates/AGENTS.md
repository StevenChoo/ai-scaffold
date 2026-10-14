# Agent guide

Start at [`.ai/_index.md`](.ai/_index.md) for agent-facing material.

<!-- BEGIN agent-generated:skill-directives -->

Before recording or changing how a project command is invoked, read and follow [`.ai/skills/adding-commands/SKILL.md`](.ai/skills/adding-commands/SKILL.md).

Before committing changes or creating branches, read and follow [`.ai/skills/git-flow/SKILL.md`](.ai/skills/git-flow/SKILL.md).

Before a session is cleared, and when asked to resume work, read and follow [`.ai/skills/handoff/SKILL.md`](.ai/skills/handoff/SKILL.md).

Before creating or editing a file under `.ai/`, read and follow [`.ai/skills/writing-project-docs/SKILL.md`](.ai/skills/writing-project-docs/SKILL.md).

<!-- END agent-generated:skill-directives -->

If `.ai/AGENTS.local.md` exists, read it after this file. It is the developer's own layer on top of this guide, never committed: context such as local
checkouts of related projects, and an **Additional instructions** section. Append those local instructions to this guide for that developer's sessions. They
supplement this guide but do not override repository rules or higher-priority instructions.

<!-- TODO(scaffold): Add project-specific rules here — build commands, review expectations, anything an agent must know before
     changing code. Delete this comment once you have. -->

## Optional tools and skills

Use relevant optional capabilities when they are available, but do not assume they are installed. Continue with the best repository-local alternative when a
tool or skill is unavailable.

- Try **Context7** first for current official documentation and API examples for third-party libraries and APIs.

<!-- BEGIN agent-generated:autoload-skills -->

<!-- No skill is applied in every session. -->

<!-- END agent-generated:autoload-skills -->

<!-- BEGIN agent-generated:optional-skills -->

- Apply relevant installed skills from [`.ai/skills/`](.ai/skills/_index.md). Skills add task-specific workflow guidance and do not override repository rules or
  developer instructions.

<!-- END agent-generated:optional-skills -->

<!-- agent-generated:requires commands/_index.md -->
Before running a project command — a build, a test, a deploy, any project tool — check [`.ai/commands/_index.md`](.ai/commands/_index.md). It records the
invocations that are not the obvious ones, and the ones an agent must not run at all.

<!-- agent-generated:requires handoffs/_index.md -->
If `.ai/handoffs/` holds a file named for the current branch, read it before starting work: it is where the last session on this branch stopped. Other
handoffs stay unread until you are asked to resume one, and [`.ai/handoffs/_index.md`](.ai/handoffs/_index.md) is the list to choose from.

<!-- agent-generated:requires context/environment.md -->
If `.ai/context/environment.local.md` exists, read it before running a command or assuming a tool is available. It describes the machine and session you are
actually running in, and it is never committed. Project policy about environments is in [`.ai/context/environment.md`](.ai/context/environment.md).

<!-- agent-generated:requires environments/_index.md -->
When `environment.local.md` names a profile in `.ai/environments/`, read that profile as well. It is the committed description of this machine's setup, and the
only file in that folder worth opening.

## Workspace boundary

Run commands from the repository root and scope filesystem operations to explicit repository-relative paths. Never pass `/`, `~`, a parent directory, or another
broad filesystem location to commands that traverse, search, modify, or delete files.

For commands such as `find` or `grep`, always provide a narrow path inside the repository; never use system-wide search. If required information appears to exist
outside the repository, ask the developer before accessing it.

## Index files (`_index.md`)

Every folder under `.ai/` has an `_index.md` that is the agent entry point for that folder. Self-contained skill directories are the exception:
their entry point is `SKILL.md`, and they are indexed by the skills index.

Read a folder's index before working in it. Its **Purpose** says what the folder answers and when it is worth opening, and its table is the folder's contents.
Open the folders the work needs; do not read the tree.
