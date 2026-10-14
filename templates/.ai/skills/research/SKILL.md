---
name: research
description: >-
  Survey what exists outside this repository before a decision is taken, and write it up as a dated document with sources.
  Use when asked to research or investigate a question, compare tools or approaches, or produce the input a design session
  will work from.
---

# Researching a question

This phase answers "what is true out there". It ends at a decision the developer takes, not at code.

## Where the output goes

<!-- agent-generated:requires research/_index.md -->
Write into `../../research/`, one document per question, and read [`../../research/_index.md`](../../research/_index.md) first: a question already surveyed
gets its document updated rather than a second one written beside it.

<!-- agent-generated:requires !research/_index.md -->
Write into this project's documentation tree, in whatever folder it keeps dated material, one document per question. Read that folder's index first: a question
already surveyed gets its document updated rather than a second one written beside it.

Follow [`../../templates/research.template.md`](../../templates/research.template.md). It opens with where the work stands, which is the line a session
resuming the question reads before anything else.

Open what this phase names and follow the indexes from there. A document this phase does not name is a document it does not need.

## How to survey

- State the question before collecting anything. A survey without a question becomes a link dump.
- Test a claim locally where it can be tested. A tracker says what someone intended; a run says what happens. Record which claims were tested and which were
  taken on trust.
- Record what each option costs, not only what it offers. An option with no stated cost has not been understood yet.
- Give every source its publisher and the date it was read. A finding that has since aged is marked historical rather than deleted or quietly restated as
  current.

## The verdict

A phase ends with a verdict, and this one has three:

- **Decided** — the developer has chosen. Record the answer in the section, with the reasoning that would otherwise be re-argued.
- **Open** — the survey is done and a question remains. Name the question; do not answer it on the developer's behalf.
- **Dropped** — the idea does not hold up. Say so and say why. A phase that cannot return this one only knows how to continue.

Stop there. Do not start building what was researched in the same session, and do not treat a recommendation as an approval. The developer's answer is what
turns **Options** into **Decided**.
