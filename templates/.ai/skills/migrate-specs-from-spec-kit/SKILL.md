---
name: migrate-specs-from-spec-kit
description: >-
  Convert Spec Kit feature folders into this project's specs folder, turning a chronological list of features into grouped
  capabilities. Use when asked to migrate specs from Spec Kit, import its spec.md files, or reorganise a specs directory
  of numbered feature folders.
requires-folder: specs
---

# Migrating specs from Spec Kit

Spec Kit's tree records *when* work happened: `specs/001-…`, `002-…`, each a feature folder. This project's tree records *what the system does*. The conversion
is therefore a regrouping, and one feature often becomes several capabilities.

## Before starting

- Read this project's specs index for the grouping already in use.
- Read every feature folder first. A later feature routinely amends an earlier one, and the current behaviour is the two of them combined — converting folders
  one at a time reproduces the history instead of the behaviour.
- Agree with the developer what happens to features never finished. Usually they are left behind.

## What maps to what

| Spec Kit                          | Here                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| `specs/<NNN>-<slug>/spec.md`      | one or more `<group>/<capability>.md`, split by what the system does     |
| the overview                      | **Purpose**                                                             |
| **Functional Requirements**       | `### Requirement:` entries, reworded with SHALL if they are not already |
| **User Scenarios**                | `#### Scenario:` entries under the requirement they demonstrate         |
| non-goals                         | **Out of scope**                                                        |
| `[NEEDS CLARIFICATION]` markers   | **Still undecided**                                                     |
| `tasks.md`                        | `<capability>.tasks.md`, only for work that continues                   |
| `plan.md`                         | nothing — it describes how a feature was built, not what the system does |
| `.specify/`, `feature.json`       | nothing — tool state, not behaviour                                     |

The numbering does not come across. A number is the order work started, and it means nothing in a tree organised by domain.

## Splitting and merging

- **One feature, several capabilities.** A feature folder that touched billing and notifications becomes one spec in each. Split by what a reader would look up.
- **Several features, one capability.** Where a later feature amended an earlier one, write the current behaviour once and do not record the amendment; git
  holds the history.
- Propose the grouping and the splits to the developer as a list before creating anything, and name every case where a feature was split or merged.

Write an `_index.md` for every folder created, and regenerate the tables.

## Finishing

- Report the mapping from feature numbers to capabilities, every split and merge, and every unfinished feature left behind.
- Leave the Spec Kit tree and `.specify/` in place. Removing them, and the per-harness command files, is the developer's own commit.
