# Handoffs index

**Purpose.** The state of work in progress, one file per piece of work, so a session that ended — cleared to save tokens, or left behind on another machine —
can be picked up where it stopped. Read the handoff for the current branch before starting work; read another only when you are asked to resume that work.

**Not for.** Anything that outlives the work. A durable fact about the project belongs in [`context/`](../context/_index.md) or in the commands index, a fact
about one machine belongs in `context/environment.local.md`, and a plan belongs wherever this project keeps plans. A handoff is deleted with the work it
describes, and anything filed here that should not die with it is lost.

**Conventions.**

- One file per piece of work, named for the branch it lives on with `/` written as `--`: `feature--markdown-wrap.md`. Work tied to no branch takes a short
  topic slug instead.
- Every handoff opens with **Where.** — the branch, or "no branch" — so the table below reads as a menu of work that can be resumed.
- About forty lines. A handoff longer than that has stopped being a snapshot and become a plan.
- Overwritten rather than appended to. It records where the work stands now, not how it got there; git already has that.
- Deleted when the work is done: a branch's handoff before the branch merges, a topic's when the topic closes.

## Index

<!-- BEGIN agent-generated:index-table -->

| File | Status   | Summary                              |
| ---- | -------- | ------------------------------------ |
| —    | Reserved | No work is handed off at the moment. |

<!-- END agent-generated:index-table -->
