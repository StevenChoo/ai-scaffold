# Changelog

Notable changes per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/); while the version is 0.x, an incompatible change goes in the minor version.

## 0.7.0 - 2026-10-14

The first release from the public repository. Earlier versions were published to npm from a private one, so their history is summarized below rather than
present in git.

### Added

- A `LICENSE` file, `CONTRIBUTING.md`, this changelog, and `docs/how-it-works.md`.
- **cli:** `--autoload` and `--no-autoload` are listed in `--help`.

### Changed

- **docs:** the README covers what the tool does and how to run it; the full reference lives under `docs/`.

### Fixed

- **cli:** reject an AI folder name that is empty, contains a slash, or is `.`, `..` or `.git`. Such a name, from a flag or from a config file found in the
  target, could make `init` write outside the target directory.
- **cli:** `--help` gave the default of `--gitignore` as true; it is false.
- **build:** the published package no longer includes the compiled test suite.

## 0.6.2 - 2026-10-14

### Fixed

- **providers:** drop the dead providers.json link from vendored SOURCE.md
- **templates:** stop the rtk skill shipping an npm example and an unfilled placeholder
- **cli:** let a selected tool load in every session like a skill

## 0.6.1 - 2026-10-04

### Fixed

- **cli:** refuse a re-run beside a config file it found on its own

## 0.6.0 - 2026-10-04

### Added

- **cli:** offer a backup before an update, as a fresh run does

### Fixed

- **cli:** let a re-run add new skills and remove unticked ones

## 0.5.0 - 2026-10-02

### Fixed

- **templates:** separate git-flow's commit examples from the prose above them
- **scaffold:** aim the migration's update at the new folder, and offer to remove a renamed one
- **docs:** run the scoped package, since the unscoped ai-scaffold on npm is another project

## 0.4.0 - 2026-10-02

### Added

- **scaffold:** record the ai-scaffold version inside the AI folder
- **scaffold:** back up the replaced setup on --fresh, with migration instructions

## 0.3.0 - 2026-09-28

### Added

- **cli:** answer init from a YAML config file
- **scaffold:** choose how wide Markdown prose is written, and what runs the formatter
- **scaffold:** let a skill offer several choices, and add commit signing to git-flow
- **scaffold:** default git-flow to Conventional Commits
- **scaffold:** write a formatter config on request, inside the AI folder
- **scaffold:** add an opt-in commands folder for project-specific invocations
- **scaffold:** ship an environment context with a detected toolchain
- **scaffold:** ship the opt-in handoffs folder and handoff skill
- **scaffold:** ship the research phase, its template and the three phase skills
- **scaffold:** ship the opt-in specs folder as a proposed grouping
- **scaffold:** let the indexes direct what a session loads
- **scaffold:** borrow the requirement shape, and ship spec migrations both ways
- **scaffold:** commit the AI folder by default, and record what was abandoned
- **scaffold:** let chosen skills load in every session
- **scaffold:** ship opt-in environment profiles, and move the local guide inside the AI folder

### Fixed

- **scaffold:** keep a symlinked local file out of the index
- **docs:** keep Prettier out of the generated credits table
- **scaffold:** derive an index summary from the whole first sentence, not its first line
- **scaffold:** keep CLAUDE.md a one-line pointer on update when nothing autoloads

## 0.2.0 - 2026-08-28

### Added

- **cli:** detect existing agent tooling and offer update or fresh scaffold
- **scaffold:** let developers select folders and skills, then generate what describes them
- **scaffold:** make every folder optional, including templates
- **scaffold:** let a skill offer a choice, starting with commit co-authorship
- **providers:** add a validated manifest of external skills and tools
- **providers:** vendor external skills from their pinned commits
- **providers:** credit every author and carry the licence into scaffolded projects
- **cli:** offer external skills and tools in the selection menus
- **providers:** support tools that need a program installed, starting with rtk
- **cli:** put advanced choices behind one question, defaulting to no
- **providers:** add the maintenance workflow for keeping copies current

## 0.1.0 - 2026-08-15

### Added

- **cli:** add interactive init menu and move templates to ai directory
- **context:** add project about prompt and adding-context skill
