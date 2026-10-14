---
name: handoff
description: >-
  Write or resume a handoff in .ai/handoffs/: the state of one piece of work, so a cleared session or another machine can
  continue it. Use when asked to write a handoff or hand work over, before a session is cleared or a machine is left, and
  when asked to resume or pick work back up.
agents-md: Before a session is cleared, and when asked to resume work, read and follow {skill}.
requires-folder: handoffs
---

# Handing work over

A handoff exists for one moment: the next session starts with nothing, and has to know where this one stopped. Everything here follows from that. It is not a
log, not a plan, and not a place to keep what the project already knows.

## What belongs in one, and what does not

| Kind of thing                                                     | Where it goes                                     |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| The state of this piece of work: next step, decisions, open ends  | the handoff                                       |
| A durable fact about the project                                  | `context/`, or the commands index                 |
| A fact about this machine or sandbox                              | `context/environment.local.md`                    |
| Anything git already records: file lists, diffs, commit summaries | nowhere — the next session can run `git log`      |

The last row is the common failure. A handoff that lists changed files is long, stale within one commit, and says nothing a `git status` would not.

## Writing one

The file is `../../handoffs/<name>.md`. Name it for the branch the work lives on, with `/` written as `--`, so `feature/markdown-wrap` becomes
`feature--markdown-wrap.md`. Work tied to no branch takes a short topic slug instead; propose one and say which you chose.

Overwrite the existing handoff for that branch. A second file for the same work is how a folder becomes a pile.

```markdown
# Handoff: markdown wrap option

**Where.** Branch `feature/markdown-wrap`.

**Next step.** Update the configuration document for the `uv-formatter` option.

**Done.** The `--wrap` flag and its config key; the guarded skill wording; the suite passes.

**Decided, and why.**

- Guards take one condition, so the rule and the command are split rather than multiplied.

**Open.**

- Does `no-reflow` need a formatter test of its own?

**Traps.**

- `mdformat` without `--with mdformat-gfm` destroys tables.
```

Rules for each part:

- **Where** comes first and is one line, because the index table takes its summary from it. Name the branch, or write "no branch".
- **Next step** is the line that must be right. One action, concrete enough to start on without re-reading anything.
- **Done** is a sentence, not an inventory. It exists so the next session does not redo something.
- **Decided, and why** carries the reasoning that would otherwise be re-argued. A decision without its reason gets overturned by the next session.
- **Open** is what is genuinely undecided. A question you can answer yourself is not open; answer it.
- **Traps** are the things that already cost this session time. A trap that will outlive the work does not belong here — move it to `context/` or the commands
  index, where the next piece of work will find it too.

Keep the whole file to about forty lines. Past that it has become a plan, and a plan belongs wherever this project keeps plans.

## Resuming

Read the handoff named for the current branch before starting work, and start from **Next step**. If no handoff matches the branch, read
[`../../handoffs/_index.md`](../../handoffs/_index.md) and ask which piece of work to resume rather than guessing from the file names.

Treat the file as the previous session's account, not as truth. Check its **Next step** against what the repository now contains: a handoff written before a
commit that landed afterwards is already partly done.

Open what this phase names and follow the indexes from there. A document this phase does not name is a document it does not need.

## Pruning

Delete a handoff when its work ends — a branch's before the branch merges, a topic's when the topic closes. Nothing enforces this, so a stale file stays in the
index offering finished work to resume. Before deleting, move anything in **Traps** or **Decided** that outlives the work into `context/` or the commands index.
