# Skills index

**Purpose.** Reusable agent workflows. A skill is a self-contained directory entered through its `SKILL.md`, describing how to carry out a recurring kind of
task in this repository. Open a skill when the task in hand matches its description, and leave the rest closed.

**Not for.** Durable facts about the project, which belong in [`context/`](../context/_index.md). A skill describes how to work; context describes what is true.

**Conventions.**

- Each skill is one directory containing a `SKILL.md` with `name` and `description` frontmatter. The description states when the skill applies, in terms an
  agent can match against a request.
- Skills add guidance. They never override repository rules or a developer's explicit instruction.
- Keep a skill focused on one recurring task. A skill that covers everything is read by nobody.
- A skill holding a `SOURCE.md` is a copy of someone else's work, kept under its own `LICENSE`. Read it rather than edit it, and take problems upstream.

## Index

<!-- BEGIN agent-generated:index-table -->

| File                                                                   | Status  | Summary                                                                                                                                       |
| ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [`adding-commands/`](adding-commands/SKILL.md)                         | Current | Record how a project command must be invoked, in .ai/commands/.                                                                               |
| [`adding-context/`](adding-context/SKILL.md)                           | Current | Adding, organizing, and curating minimal, high-impact context files.                                                                          |
| [`design/`](design/SKILL.md)                                           | Current | Turn research or a request into a specification the developer approves before anything is built.                                              |
| [`git-flow/`](git-flow/SKILL.md)                                       | Current | Branching, commit cadence, and commit message format.                                                                                         |
| [`handoff/`](handoff/SKILL.md)                                         | Current | Write or resume a handoff in .ai/handoffs/.                                                                                                   |
| [`implement/`](implement/SKILL.md)                                     | Current | Build an approved specification one task at a time, stopping at anything that needs a decision.                                               |
| [`migrate-specs-from-openspec/`](migrate-specs-from-openspec/SKILL.md) | Current | Convert an OpenSpec tree into this project's specs folder, grouping a flat set of capabilities into a structure a large project can navigate. |
| [`migrate-specs-from-spec-kit/`](migrate-specs-from-spec-kit/SKILL.md) | Current | Convert Spec Kit feature folders into this project's specs folder, turning a chronological list of features into grouped capabilities.        |
| [`migrate-specs-to-openspec/`](migrate-specs-to-openspec/SKILL.md)     | Current | Convert this project's specs folder into an OpenSpec tree, when the project is adopting OpenSpec.                                             |
| [`migrate-specs-to-spec-kit/`](migrate-specs-to-spec-kit/SKILL.md)     | Current | Convert this project's specs folder into Spec Kit feature folders, when the project is adopting Spec Kit.                                     |
| [`research/`](research/SKILL.md)                                       | Current | Survey what exists outside this repository before a decision is taken, and write it up as a dated document with sources.                      |
| [`writing-project-docs/`](writing-project-docs/SKILL.md)               | Current | Writing and maintaining Markdown under `.ai/`.                                                                                                |

<!-- END agent-generated:index-table -->
