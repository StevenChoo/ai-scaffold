---
name: git-flow
description: >-
  Git workflow for committing changes, branching for features/subjects, and maintaining commit hygiene in this repository.
  Trigger whenever committing code or docs, completing a task, creating branches, switching subjects, or preparing pull requests.
agents-md: Before committing changes or creating branches, read and follow {skill}.
options:
  - name: project-prefixes
    prompt: Use this project's own commit prefixes instead of Conventional Commits?
  - name: agent-info
    prompt: Should commits record the agent that wrote them?
  - name: no-gpg-sign
    prompt: Should commits skip GPG signing, for a machine with no signing key?
---

# Git workflow

Follow these conventions for all branching and committing in this repository to keep git history clean, reviewable, and atomic.

## Branching strategy

- **Branch per feature/subject:** Create a dedicated branch for each distinct subject, feature, or refactoring effort.
- **Switching subjects:** When switching tasks or starting work that is unrelated or off-topic from the current branch, create a new branch from the base branch.
- **No git worktrees:** Do not use `git worktree` commands. Use standard branch checkouts.
- **Preserve work:** If in doubt about whether work is related, create a new branch or commit immediately to protect working state.
<!-- agent-generated:requires handoffs/_index.md -->
- **Prune the handoff:** Before a branch merges, delete its file in `../../handoffs/`. Its work is finished, and a handoff that outlives the branch sends the
  next session back to it.

## Commit cadence

- **Commit completed tasks:** Create a commit immediately after each concrete task is finished.
- **Commit before switching:** Changing subjects or starting a new action that is not a direct follow-up to the preceding work indicates that current changes must be committed first.
- **Atomic units:** Avoid bundling unrelated changes (e.g. documentation scaffolding, feature implementation, bugfixes) into a single commit.
- **A rejected approach is stated as a reason, not as an outcome.** "Used a queue instead of a cron job" tells a later reader nothing; "a cron job loses the
  retry window between runs" tells them why not to propose it again.

## Commit message format

### 1. Subject line

<!-- agent-generated:requires !option:project-prefixes -->
Use a [Conventional Commits](https://www.conventionalcommits.org/) type, an optional scope, and a sentence saying what was done. The types are `feat` for a new
capability, `fix` for a defect, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`, and `chore` for everything else. Machine-readable history is the
reason the type is fixed rather than descriptive: changelog and release tooling reads it, and an invented type is skipped in silence.

<!-- agent-generated:requires !option:project-prefixes -->
```text
feat(cli): add a config file that answers every question
fix(parser): handle an empty input without panicking
docs(readme): explain what --update leaves alone
```

<!-- agent-generated:requires option:project-prefixes -->
Use one of this project's prefixes, a scope, and a sentence saying what was done: `chore` for maintenance, documentation, configuration, scaffolding and
dependency updates; `fix` for defects and broken links; `feature` for new capabilities, commands and functionality. These are the project's own and are not
Conventional Commits, so tooling that reads commit types will not recognise `feature`.

<!-- agent-generated:requires option:project-prefixes -->
```text
chore(docs): scaffold documentation and agent guidance
feature(api): add pagination to the search endpoint
fix(parser): handle an empty input without panicking
```

**Scope** is the area of the repository the change belongs to: a folder, a package, or a subsystem — `cli`, `docs`, `api`. Lowercase, one word, and left out
entirely when a change is repository-wide.

A change that breaks an interface carries `!` before the colon, whatever its type, and a `BREAKING CHANGE:` footer naming what broke and what to do instead.
The marker is what makes a break findable later, and what release tooling reads as a major version; a sentence in the body is neither. `BREAKING CHANGE` is
uppercase, which is the one part of a commit message that is case-sensitive.

```text
fix(api)!: return 404 for a missing collection instead of an empty list

BREAKING CHANGE: a caller relying on an empty list must now handle 404.
```

### 2. Commit description (optional)

When additional detail is helpful, provide a bulleted list in the commit body:

- Use short, clear sentences per bullet.
- **Maximum 8 bullets:** If more than 8 bullets are required, the description is too long and/or the task should have been broken into smaller commits.

Example:

```text
fix(api): reject a page size the endpoint cannot serve

- Validate page and page-size against the configured bounds.
- Return the offending value in the error, so a caller can correct it.
- Cover the first page, the last page, and an out-of-range request.
```

### 3. Agent attribution

<!-- agent-generated:requires option:agent-info -->
Record the agent in the commit message trailers, separated from the description by a blank line: name the agent and the session it ran in, and add a
`Co-Authored-By:` trailer for it, so a reader can trace where the change came from.

<!-- agent-generated:requires !option:agent-info -->
Do not record the agent anywhere in the commit. Write no `Co-Authored-By:` trailer for an agent, and no "generated by", "created with", or similar note in the
subject, the description, or the trailers. A commit is the work of the developer who owns it, and its message must read that way.

### 4. Signing

<!-- agent-generated:requires !option:no-gpg-sign -->
Commit normally and let the repository's git configuration decide whether the commit is signed. If signing fails because no signing key is available, say so and
stop rather than retrying with signing disabled: whether a commit is signed is the developer's policy, not a detail to work around.

<!-- agent-generated:requires option:no-gpg-sign -->
Pass `--no-gpg-sign` on every commit. This project's git configuration asks for signed commits on machines that cannot produce them, so the flag is what makes a
commit succeed here. Do not change the git configuration to achieve the same thing.

## Safety check

- Verify staged files before committing to prevent accidentally committing local configurations (`*.local.md`, `.env`, temp files) or build output.
