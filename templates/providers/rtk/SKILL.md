---
name: rtk
description: >-
  Run shell commands through rtk so their output is compressed before an agent reads it.
  Use when running builds, tests, git commands, or anything else whose output is long.
---

# Using rtk in this project

[rtk](https://github.com/rtk-ai/rtk) is a command-line proxy that filters the output of common
tools before an agent reads it, which keeps long build and test logs from filling the context
window. It is written by rtk-ai and licensed under Apache-2.0.

This project does not install rtk. The binary is installed once per machine and shared by every
project that wants it, so this skill only records how this project expects it to be used.

## Check it is there

```sh
rtk --version
```

If that fails, rtk is not installed. Install it, or carry on without it: every command below
works unproxied, only more verbosely.

## Use it

Put `rtk` in front of a command whose output is long:

```sh
rtk git status
rtk git log
```

rtk can also install a hook that rewrites commands automatically, so `git status` becomes
`rtk git status` without anyone typing it. That hook is global and is set up with `rtk init -g`,
not by this project.

<placeholder>List this project's own commands that are worth proxying — its build, test and lint
commands, as recorded in the commands index or the project's scripts — and any that must not be:
anything whose exact output is parsed rather than read. Name only commands this project has.
Delete this note once you have.</placeholder>

## What not to do

- Do not proxy a command whose output is consumed by another program. rtk changes that output
  by design.
- Do not add rtk to this project's dependencies or install scripts. It is a machine-level tool,
  and a project that requires it stops working for anyone who has not installed it.
- Report problems with rtk upstream rather than here.
