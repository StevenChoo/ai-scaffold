---
name: migrate-specs-to-spec-kit
description: >-
  Convert this project's specs folder into Spec Kit feature folders, when the project is adopting Spec Kit. Use when asked
  to migrate specs to Spec Kit, adopt Spec Kit in a project that already has specs here, or produce spec.md files in its
  format from the existing ones.
requires-folder: specs
---

# Migrating specs to Spec Kit

Spec Kit organises by feature, numbered in the order features were started, each in its own folder holding a spec, a plan and tasks. This project organises by
capability inside groups. The conversion is therefore lossy in one direction and inventive in the other: say so before starting.

## Before starting

- Confirm the developer has run `specify init` themselves. It writes `.specify/` and per-harness command directories, which this project's scaffold
  deliberately never writes.
- Read the specs index to learn the grouping, and agree the feature numbering with the developer before creating anything. Numbers are chronological and
  permanent; a wrong one is not worth renumbering later.

## What maps to what

| Here                                  | Spec Kit                                                                |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `<group>/<capability>.md`             | `specs/<NNN>-<group>-<capability>/spec.md`                              |
| **Purpose**                           | the spec's overview                                                     |
| `### Requirement:` with its SHALL     | a numbered entry under **Functional Requirements**                      |
| `#### Scenario:` with Given/When/Then | an entry under **User Scenarios**, keeping the Given/When/Then wording   |
| **Out of scope**                      | the spec's non-goals                                                    |
| **Still undecided**                   | a `[NEEDS CLARIFICATION]` marker, which is what its workflow expects    |
| `<capability>.tasks.md`               | `tasks.md` in the same feature folder                                   |
| Folder grouping and every `_index.md` | nothing — the group survives only inside the folder name               |

Do not write `plan.md`. It is generated from a spec by the tool's own planning step, and a hand-written one will be overwritten or, worse, trusted.

## What is lost, and say so

Grouping as structure, the indexes, and the ability to answer "what does this domain do today" from the tree: Spec Kit's tree is ordered by when work started,
not by what the system does. In exchange the developer gets the consistency check across spec, plan and tasks, and the constitution it checks them against.

## Finishing

- Run the tool's own analysis step over each converted feature and fix what it reports.
- Report the number assigned to each capability, and every `[NEEDS CLARIFICATION]` marker left behind.
- Leave the old tree in place and tell the developer it is now stale.
