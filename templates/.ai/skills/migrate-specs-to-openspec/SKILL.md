---
name: migrate-specs-to-openspec
description: >-
  Convert this project's specs folder into an OpenSpec tree, when the project is adopting OpenSpec. Use when asked to
  migrate specs to OpenSpec, adopt OpenSpec in a project that already has specs here, or produce OpenSpec-format specs
  from the existing ones.
requires-folder: specs
---

# Migrating specs to OpenSpec

OpenSpec owns its own tree. After this migration the specs folder here is no longer the source of truth, and keeping both is the failure this migration exists
to avoid.

## Before starting

- Confirm the developer has run `openspec init`, or run nothing yourself: the CLI writes its own folder and its own per-harness command files, and that is the
  developer's decision to take.
- Read the specs index to learn the grouping in use. OpenSpec's tree is flat by capability, so every group becomes part of a name.
- Do not delete anything. The old tree is removed by the developer once they have read the new one.

## What maps to what

| Here                                  | OpenSpec                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `<group>/<capability>.md`             | `openspec/specs/<group>-<capability>/spec.md`                            |
| **Purpose**                           | the spec's opening paragraph                                             |
| `### Requirement:` with its SHALL     | `### Requirement:` unchanged — this is why the template uses that shape  |
| `#### Scenario:` with Given/When/Then | `#### Scenario:` unchanged                                               |
| **Out of scope**                      | a requirement stating what the system SHALL NOT do, or dropped           |
| **Still undecided**                   | nothing — resolve each one with the developer, or carry it into a change |
| `<capability>.tasks.md`               | `openspec/changes/<id>/tasks.md`, if the work is unfinished              |
| Folder grouping and every `_index.md` | nothing — OpenSpec has no index layer                                    |

The names are the part to get right. A path is an identifier here, so `backend/billing/invoicing.md` becomes `billing-invoicing`, not `invoicing`: two groups
may each hold a capability of the same name, and flattening silently merges them.

## What is lost, and say so

Grouping, the per-folder indexes, and the path as a citable identifier. Anything citing a spec by path has to be rewritten. Say this to the developer before
converting, not after: it is the cost of the CLI, the validation and the change lifecycle they are buying.

## Finishing

- Run `openspec validate --strict` and fix what it reports. The conversion is not done while the validator disagrees.
- Report which capabilities moved, which names changed, and every **Still undecided** entry that had nowhere to go.
- Leave the old tree in place and tell the developer it is now stale, so they remove it in one deliberate commit.
