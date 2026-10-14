# Context index

**Purpose.** Curated, durable facts an agent needs before acting: what this project is, who it serves, and what surrounds it. Open it when starting in an
unfamiliar area, or before assuming anything about the project or the machine it runs on.

**Not for.** Task plans, open work, and implementation status. A context file describes what is true, not what is next.

**Conventions.**

- Keep each fact in exactly one file and link rather than repeat it.
- Prefer durable statements. If a sentence goes stale every sprint, it belongs somewhere else.
- A `*.local.md` file describes one machine. It is never committed and never listed here.
<!-- agent-generated:requires skills/adding-context/SKILL.md -->
- Follow [`adding-context`](../skills/adding-context/SKILL.md) when adding or organizing context files.

## Index

<!-- BEGIN agent-generated:index-table -->

| File                               | Status | Summary                                                                  |
| ---------------------------------- | ------ | ------------------------------------------------------------------------ |
| [`environment.md`](environment.md) | Draft  | Where the project runs, its detected toolchain, and what an agent may do. |
| [`project.md`](project.md)         | Draft  | Scope, current phase, and repository rules.                              |

<!-- END agent-generated:index-table -->
