# How it works

What `init` does to the files it writes, and the frontmatter and markers a skill uses to take part. Read this before writing your own skill, or editing a file
the scaffold regenerates.

## Generated regions

Some regions describe what a repository contains, so shipping them as fixed text would describe a repository nobody has. They are marked in the files and
regenerated as the last step of every run, from the tree that actually exists:

| Region             | Where             | Generated from                                      |
| ------------------ | ----------------- | --------------------------------------------------- |
| `index-table`      | every `_index.md` | the folder's direct children                        |
| `skill-directives` | `AGENTS.md`       | the `agents-md` frontmatter of each installed skill |
| `optional-skills`  | `AGENTS.md`       | whether a skills folder was scaffolded              |

Everything outside those markers is yours. Within an index table, a row that already exists keeps its status and summary, so wording you wrote survives
regeneration; only new rows are generated, and rows for files that are gone are dropped. A document you add by hand is therefore indexed on the next run, with a
summary taken from its own `**Purpose.**` line or opening sentence.

## Announcing a skill in `AGENTS.md`

A skill reaches `AGENTS.md` by declaring the sentence itself, where `{skill}` becomes a link to it:

```yaml
---
name: git-flow
description: >-
  Git workflow for committing changes and branching.
agents-md: Before committing changes or creating branches, read and follow {skill}.
---
```

A skill without an `agents-md` field is installed and indexed but not announced at the top of the guide.

## Skill options

A skill may offer yes/no choices, asked in the advanced flow and only on a run that actually writes the skill. It declares them in its own frontmatter and
carries both answers in its body, so the installed copy states one of them and never both:

```yaml
options:
  - name: agent-info
    prompt: Should commits record the agent that wrote them?
  - name: no-gpg-sign
    prompt: Should commits skip GPG signing, for a machine with no signing key?
```

```markdown
<!-- agent-generated:requires option:agent-info -->

Record the agent in the commit message trailers...

<!-- agent-generated:requires !option:agent-info -->

Do not record the agent anywhere in the commit...
```

The `options` block configures the scaffolder rather than instructing an agent, so it is stripped on the way out. A question left sitting in a file whose prose
already answers it reads as though it were still open. The options that ship are listed under [per-skill choices](configuration.md#per-skill-choices).

## Guarded prose

Every folder is optional, so shipped prose that points at one would dangle in a repository that declined it. Such a block declares what it depends on, and is
dropped when that dependency is not written:

```markdown
<!-- agent-generated:requires templates/_index.template.md -->

- Follow `.ai/templates/_index.template.md` for index structure.
```

The path is relative to the AI folder, so renaming that folder does not affect it. A guard covers the block that follows: one list item, or one paragraph. The
comment itself is resolved at write time and never reaches a scaffolded repository, whether the dependency held or not. This is what lets `templates/` be
declined without leaving `AGENTS.md` and the skills referring to files that are not there.

Because guards are resolved when a file is written, adding a folder back later restores its guarded prose only under `--fresh`; `--update` leaves existing files
alone by design.
