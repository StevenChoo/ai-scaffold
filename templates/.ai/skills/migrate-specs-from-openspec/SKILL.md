---
name: migrate-specs-from-openspec
description: >-
  Convert an OpenSpec tree into this project's specs folder, grouping a flat set of capabilities into a structure a large
  project can navigate. Use when asked to migrate specs from OpenSpec, import OpenSpec specs, or organise an OpenSpec tree
  that has become unreadable.
requires-folder: specs
---

# Migrating specs from OpenSpec

This is the harder direction, because it adds something the source does not have: structure. OpenSpec keeps capabilities flat under its spec root, which is
what stops scaling somewhere past a few dozen of them. The conversion is mechanical except for the grouping, and the grouping is the developer's decision.

## Before starting

- Read this project's specs index for the grouping already in use. If specs are already here, new ones join that structure rather than starting a second one.
- Read the OpenSpec tree in full before writing anything: `openspec/specs/**/spec.md` for current behaviour, and `openspec/changes/` for work in flight.
- Convert only what is current. A change still in `changes/` is unfinished work, and its `tasks.md` comes across only if the developer says the work continues.

## What maps to what

| OpenSpec                              | Here                                                          |
| ------------------------------------- | ------------------------------------------------------------- |
| `openspec/specs/<capability>/spec.md` | `<group>/<capability>.md`, in a group agreed with the developer |
| the opening paragraph                 | **Purpose**                                                   |
| `### Requirement:` with its SHALL     | `### Requirement:` unchanged                                  |
| `#### Scenario:`                      | `#### Scenario:` unchanged                                    |
| a requirement stating a prohibition   | **Out of scope**, where it reads better as a boundary         |
| `changes/<id>/tasks.md`               | `<capability>.tasks.md`, only for work that continues         |
| `changes/archive/`                    | nothing — history stays where it is, and git already has it   |

## Choosing the grouping

This is the part worth doing slowly, and the part that must not be done silently.

1. List the capability names and look for the nouns that repeat: the domains are usually already in the names, since a flat tree forces people to prefix.
2. Propose a grouping to the developer as a list — every capability with the group it would land in — and wait. Do not create folders first.
3. Put anything cross-cutting in one group and say which capabilities you judged cross-cutting; that judgement is the one most often wrong.
4. Keep the tree shallow: four levels below the specs folder is the stated cap, and a first conversion rarely needs more than two.
5. A capability whose group is genuinely unclear goes at the top level, not into a group invented to hold it.

Write an `_index.md` for every folder created, and regenerate the tables. An imported tree without indexes is the flat pile again, one directory deeper.

## Finishing

- Report the grouping as built, every capability whose placement was a judgement call, and anything in `changes/` that was deliberately not converted.
- Leave the OpenSpec tree in place. The developer removes it once the new tree has been read, and until then the two are compared, not merged.
