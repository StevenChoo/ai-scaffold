---
name: design
description: >-
  Turn research or a request into a specification the developer approves before anything is built. Use when asked to design
  a feature, write or update a spec, or work out what to build from a research document.
---

# Designing from research

This phase answers "what exactly are we building". Its input is a research document or a request; its output is a spec the developer has approved.

## Before writing

<!-- agent-generated:requires specs/_index.md -->
Read [`../../specs/_index.md`](../../specs/_index.md) first. It states how this project groups its specs, and that grouping is the project's own: place a new
spec in the group that fits, propose a new group only when none does, and never reorganise the tree as a side effect of adding to it.

<!-- agent-generated:requires !specs/_index.md -->
Read the index of wherever this project keeps its specs, and follow the grouping that is already there. Place a new spec in the group that fits, propose a new
group only when none does, and never reorganise the tree as a side effect of adding to it.

Read the research the design follows from, if there is one, and carry its decisions forward. A decision re-argued in the spec is a decision that will be
re-argued again in the implementation.

Open what this phase names and follow the indexes from there. A document this phase does not name is a document it does not need.

## Writing the spec

- One capability per file. A spec covering a whole feature is the document nobody can review and nobody updates.
- State what the capability does, what it must not do, and how a reader can tell it works. Leave how it is built to the implementation.
- Name what is still undecided instead of inventing it. An invented answer is indistinguishable from an agreed one once it is written down.
- Keep the status honest: `Draft` while it is being written, `Proposed` while it awaits the developer, `Current` once it is the truth.

## The verdict

The phase ends when the developer approves the spec, and not before. Do not implement it in the same session: approval is the gate, and a spec written and built
in one pass has never been reviewed.
