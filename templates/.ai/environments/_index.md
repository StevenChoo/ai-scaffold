# Environments index

**Purpose.** Committed descriptions of the machines and sandboxes this project is worked on, one profile per setup, so a developer who moves between machines
keeps them in step through git. Do not browse this folder: `context/environment.local.md` names the one profile that applies to the current machine, and that
profile is the only one worth reading.

**Not for.** Project policy about environments, which belongs in [`context/environment.md`](../context/environment.md). Anything sensitive — a credential, a
token's contents, a path that identifies a person — which is never committed and stays in a `*.local.md` file.

**Conventions.**

- One file per setup, named for it: `macos-sandbox.md`, `ubuntu-sandbox.md`. A profile describes what that setup has installed, what it restricts, and what to
  do instead, such as "no SSH key inside the sandbox; push over HTTPS".
- A machine selects its profile with a one-line `context/environment.local.md`: `This machine: environments/macos-sandbox.md`. A pointer, not a symlink, so it
  resolves inside a sandbox that hides the rest of the disk.
- A profile opens with a sentence saying which setup it describes, which is the summary its row takes.
<!-- agent-generated:requires skills/adding-context/SKILL.md -->
- Follow [`adding-context`](../skills/adding-context/SKILL.md) when setting up a new machine.

## Index

<!-- BEGIN agent-generated:index-table -->

| File | Status   | Summary                           |
| ---- | -------- | --------------------------------- |
| —    | Reserved | No machine setup is profiled yet. |

<!-- END agent-generated:index-table -->
