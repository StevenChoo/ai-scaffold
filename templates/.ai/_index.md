# Agent resources index

**Purpose.** Tool-agnostic project context and reusable resources intended for AI coding agents.

**Not for.** General application source code or project-specific build artifacts.

**Conventions.**

- Keep canonical content independent of a specific AI product.
- Tool-specific directories contain thin adapters, not duplicated guidance.
- The table below is the map a session reads to decide where to go. Open the folders the work needs and follow their indexes from there; reading the whole tree
  is never the cheaper option.

## Index

<!-- BEGIN agent-generated:index-table -->

| File                                      | Status  | Summary                                                                 |
| ----------------------------------------- | ------- | ----------------------------------------------------------------------- |
| [`commands/`](commands/_index.md)         | Current | How this project's commands must actually be invoked.                   |
| [`context/`](context/_index.md)           | Current | Curated project, application, team, and related-project context.        |
| [`environments/`](environments/_index.md) | Current | One committed profile per machine setup; the local pointer names which. |
| [`handoffs/`](handoffs/_index.md)         | Current | The state of work in progress, one file per piece of work.              |
| [`prompts/`](prompts/_index.md)           | Current | Reusable task prompts.                                                  |
| [`research/`](research/_index.md)         | Current | Dated surveys of external tooling and conventions.                      |
| [`skills/`](skills/_index.md)             | Current | Reusable agent workflows.                                               |
| [`specs/`](specs/_index.md)               | Current | What this project is supposed to do, one capability per file.           |
| [`templates/`](templates/_index.md)       | Current | Human-owned templates for agent resources.                              |

<!-- END agent-generated:index-table -->
