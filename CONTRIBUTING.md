# Contributing

Issues and pull requests are welcome. For anything larger than a fix, open an issue first so the change can be agreed before it is written.

## Prerequisites

- Node 22.13 or newer.
- pnpm 10 or newer.

## Building and testing

```sh
pnpm install
pnpm build          # compile src/ to dist/
pnpm check          # type-check without emitting
pnpm test           # build, then run the test suite from dist/
pnpm start --help   # run the compiled CLI
pnpm dev            # compile in watch mode
```

Every change must leave `pnpm check` and `pnpm test` passing, and Markdown formatted with `pnpm fmt:md`. `templates/` and `vendor/` are deliberately left
unformatted: a guard comment must stay against the block it governs, and a vendored copy must match its pin.

## Trying a scaffold safely

A scaffold writes into a directory that is not this repository. Try it against a throwaway target, never a real project:

```sh
mkdir -p /tmp/scaffold-try && cd /tmp/scaffold-try && git init -q
node /path/to/ai-scaffold/dist/cli.js init .
```

Tests follow the same rule: each one scaffolds into a temporary directory it creates itself.

## Project layout

| Path             | Contents                                                     |
| ---------------- | ------------------------------------------------------------ |
| `src/`           | The CLI entry point and command implementations.             |
| `templates/`     | The scaffold payload copied into a target repository.        |
| `vendor/`        | Pinned copies of external skills, each with its licence.     |
| `providers.json` | Where each external skill comes from, and the pinned commit. |
| `docs/`          | User documentation.                                          |

A skill of this project's own is a directory under `templates/.ai/skills/`; adding one is enough to make it selectable. A new skill, tool, folder, or flag also
belongs in [`docs/configuration.md`](docs/configuration.md), which is maintained by hand.

What `init` writes outside the AI folder is limited to `AGENTS.md`, `CLAUDE.md`, and one line in `.gitignore`, and a test asserts it. A change that needs a
fourth file is a design decision to raise in an issue first.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`, or `chore`, an
optional scope such as `cli`, `templates` or `providers`, and a subject saying what was done. Mark a breaking change with `!` and a `BREAKING CHANGE:` footer.

## Adding an external skill

External skills are vendored: copied from their upstream repository at a pinned commit and shipped in the package. Add an entry to
[`providers.json`](providers.json) and run `pnpm vendor`. Everything that differs between providers — which repository, which commit, which directory inside it
— is a field, so there is no per-source script.

Check the licence before anything else. A vendored copy is redistribution, permitted only when the copyright notice and licence text travel with it.

- Record the licence's SPDX identifier and the author's name as written in the copyright line, not the GitHub handle.
- A repository with no licence cannot be vendored. Link to it instead.
- Anything beyond the permissive licences already here, MIT and Apache-2.0, needs a maintainer's decision.

Then read what arrived. A skill instructs an agent, so it deserves the same scrutiny as a dependency:

- `SKILL.md`, `LICENSE` and `SOURCE.md` are all present, and the licence names the author the entry credits.
- A skill that tells an agent to run commands, install things, or contact a network service needs a maintainer's decision before it ships.
- The README credits table gained a row. `pnpm vendor` regenerates it; never edit it by hand.
- The provider is listed in the skills or tools table in [`docs/configuration.md`](docs/configuration.md), with its extras or required binary.

| Command                | What it does                                                          |
| ---------------------- | --------------------------------------------------------------------- |
| `pnpm vendor`          | Copy every provider from the commit pinned in `providers.json`        |
| `pnpm vendor:outdated` | Report which providers have moved on, changing nothing                |
| `pnpm vendor:update`   | Repin each provider to the newest commit on its ref, then re-vendor   |
| `pnpm vendor:check`    | What CI runs: fail if a copy drifts from its pin or nothing claims it |

Read the diff of a `vendor:update` rather than trusting it. An upstream change alters what a skill tells an agent to do, which is a change in behaviour even
though no code here changed.

Copies are kept in this repository on purpose. Skills get deleted and repositories get renamed; a scaffold that fetched from upstream at install time would stop
working, and a pinned copy does not. To remove a provider, delete its entry, run `pnpm vendor`, and delete the directory it no longer claims.
