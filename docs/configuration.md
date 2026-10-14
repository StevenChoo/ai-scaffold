# Configuration reference

Every setting `ai-scaffold init` accepts, grouped as the interactive run asks for them. Each row names the flag that sets it non-interactively, the question an
interactive run asks instead, and what happens when neither is given.

A list flag (`--folders`, `--skills`, `--tools`, `--options`, `--extras`) takes comma-separated names and accepts `none` for an empty selection. Naming
something the payload does not ship is an argument error, so a typo never silently installs nothing. Flags that read a value also accept `--flag=value`.

Any of it can also be written once in a [config file](#config-file) instead of typed each run.

## Target and layout

| Setting                 | Flag                                    | Asked as                                | Default                                                                      |
| ----------------------- | --------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| Target directory        | positional `target`                     | not asked                               | the current directory                                                        |
| AI folder name          | `--folder`, `--folder-name`             | Name for AI tool folder:                | `.ai`                                                                        |
| Track scaffold version  | `--track-version`, `--no-track-version` | Track the ai-scaffold version in `.ai`? | yes; not asked, and never written, on an update                              |
| Project description     | `--about`, `--description`              | What is the project about?              | empty; the question is skipped when an existing `context/project.md` is kept |
| Environment constraints | `--environment`                         | not asked                               | the placeholder in `context/environment.md`                                  |

The AI folder is recognized by its shape rather than its name, so a tree created with `--folder .my-agent` is found again on a re-run without that flag.

The version is recorded in `.ai/.ai-scaffold.version`, a comment line followed by the version number, so an older install can be told apart before it is
upgraded. It lives inside the AI folder because that is the only ground the tool owns, and it is a dotfile, so no index lists it. Only a run that writes the
whole scaffold records it — a first scaffold or `--fresh`. An update keeps files an older version wrote, so stamping the current version on that tree would
misdate it, and an install that has no version file keeps having none until it is re-scaffolded.

### Environment context

`context/environment.md` ships with the context folder and holds project policy: where the project runs, what an agent may do in each place, and what is
deliberately unavailable. Its **Local development** section is a generated region, detected from the files at the repository root — the package manager from
`packageManager` or a lockfile, the runtime from `engines`, the scripts that can be run, and a Gradle or Maven wrapper, uv, Poetry, Cargo or Go when their files
are present. It is regenerated on every run, so a new script or a changed lockfile reaches it without anyone editing the file. CI workflows are not read.

`--environment` fills the **Constraints** section, and only that section: the deployed-environments table is left for a person to fill in, since its last column
is where "never act against production" lives.

What a particular machine or sandbox actually has is not policy, and does not belong in a committed file. `context/environment.local.md` is reserved for it: a
sandbox that describes itself writes or links its document there, `AGENTS.md` tells an agent to read it when present, and nothing ever parses it. A `.gitignore`
inside the AI folder keeps `*.local.md` out of git whatever the root `.gitignore` says, and index tables skip it, so no committed row points at a file only one
machine has.

#### Providing the local file

`init` never writes `environment.local.md`; it only reserves the name, keeps it out of git and out of the indexes, and tells an agent to read it. Any of these
puts it there, in order of preference:

| Way                   | Command                                                         | Holds when                                                                  |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Generate it at launch | have the sandbox launcher write its description to the path     | always — the freshest, and readable because the project directory always is |
| Copy it               | `cp ~/path/to/sandbox.md .ai/context/environment.local.md`      | the sandbox has not changed since the copy; re-copy after changing it       |
| Link it               | `ln -s ~/path/to/sandbox.md .ai/context/environment.local.md`   | the link's target is readable from inside the sandbox — see below           |
| Write it by hand      | a few lines: what is installed, what is not, what to do instead | there is no sandbox, only a machine with its own quirks                     |

**A link out of the project usually dangles inside a sandbox.** A Firejail-style sandbox hides most of `$HOME`, so a symlink that resolves on the host points at
nothing from inside the jail, and the agent finds an unreadable file exactly when it needs the description. Either generate or copy the file into the project,
or grant the link target's directory read-only access in the sandbox's own configuration first. Most sandboxes read such grants at launch, so the link resolves
from the next session on.

Whichever way, the agent is told the file is authoritative about the here and now, and that it must not edit it: a sandbox description is another tool's output,
and it is regenerated or re-copied, never patched.

#### One setup on several machines

A developer who works on more than one machine with the same sandbox would otherwise copy the local file between them by hand. With `environments/` selected,
describe the setup once as a committed profile — `.ai/environments/macos-sandbox.md`: what is installed, what is restricted, what to do instead — and make each
machine's local file one line naming it:

```text
This machine: environments/macos-sandbox.md
```

`AGENTS.md` tells an agent to read the named profile, and the folder's index tells it not to browse the others. Git carries a fix to a profile to every machine
that uses it, and only the pointer stays local. A pointer rather than a symlink, because it names a path inside the project, which a sandbox can always read. A
profile is committed, so it never holds a credential, a token's contents or a personal path.

## Markdown convention

| Setting          | Flag                          | Asked as                                                                                            | Default      |
| ---------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------ |
| Prose line width | `--wrap <columns\|no-reflow>` | not asked                                                                                           | `160`        |
| Formatter runner | `--options uv-formatter`      | writing-project-docs: Run the Markdown formatter with uv instead of npx?                            | npx          |
| Formatter config | `--options formatter-config`  | writing-project-docs: Write a formatter config into the AI folder, for editors that format on save? | none written |

Both settings are written into the `writing-project-docs` skill, which is what tells an agent how wide to write and what to run. A column count of 40 or more
produces "wrap prose at N columns"; `no-reflow` produces "one line per paragraph, and the reader's editor wraps it". Anything else is an argument error, since a
width nobody meant is worse than a width nobody set.

The runner decides which command that skill carries — one of them, not a menu, so the installed skill is as short as the choice allows:

| Runner              | Width                                                                 | `no-reflow`                                                          |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| npx (default)       | `npx prettier@3 --prose-wrap always --print-width 160 --write <file>` | `npx prettier@3 --prose-wrap never --print-width 400 --write <file>` |
| uv (`uv-formatter`) | `uvx --with mdformat-gfm mdformat --wrap 160 <file>`                  | `uvx --with mdformat-gfm mdformat --wrap no <file>`                  |

`formatter-config` writes that answer to disk as well, as a `.prettierrc` or an `.mdformat.toml` **inside the AI folder** — where it governs the agent material
and nothing else, and where an editor formatting on save picks it up. It is off by default, because a scaffold that drops formatting policy at a repository root
is setting policy for files it has nothing to do with. The command keeps its flags either way, and a flag wins over a config file, so the two cannot disagree
about a file they both apply to.

Neither needs anything installed: each runner fetches its formatter on first use. Both formatters pad every table cell so the columns line up in the raw file,
which is the point of running one at all — an agent cannot count a column, and a table nobody can read unrendered is the thing being fixed.

Two details the commands encode:

- `mdformat` on its own is a CommonMark formatter and does not know GFM tables. Without `--with mdformat-gfm` it reflows a table into a paragraph and destroys
  it, so the plugin is not optional.
- Under `--prose-wrap never` specifically, Prettier stops padding a table whose row exceeds the print width. That is why the no-reflow command carries a wide
  one: it governs tables only, since prose is not wrapped in that mode at all. `mdformat` pads at any width.

## Contents

| Setting                     | Flag                      | Asked as                            | Default                                                                                                                                           |
| --------------------------- | ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folders under the AI folder | `--folders`               | Which folders should `.ai` contain? | `context/`, `prompts/`, `skills/`, `templates/`; `commands/`, `environments/`, `handoffs/`, `research/` and `specs/` are offered but not selected |
| Skills                      | `--skills`, `--no-skills` | Which skills should be installed?   | this repository's own skills; an external one only when named                                                                                     |
| Tools                       | `--tools`, `--no-tools`   | Which tools should be installed?    | none                                                                                                                                              |

Five folders are offered but not selected by default, because each is useless until a developer fills it: `commands/`, which records how a project's commands
must actually be invoked; `environments/`, which holds one committed profile per machine setup; `handoffs/`, which holds the state of work in progress so a
cleared session or another machine can continue it; `research/`, which holds dated surveys written before a decision is taken; and `specs/`, which holds what
the project is supposed to do, one capability per file. `commands/` and `handoffs/` each bring a skill bound to them by `requires-folder` — `adding-commands`
and `handoff` — which is left out when the folder is not scaffolded. `specs/` also brings the four `migrate-specs-*` skills, which convert a tree to or from
OpenSpec and Spec Kit and are pointless without it. `research/` and `specs/` otherwise do not: the `research`, `design` and `implement` skills are installed
either way and name the project's own documentation or spec location when the folder was declined, since the phases are worth following in a repository that
keeps those documents elsewhere.

The folder menu shows a hint for every folder, with an example of what it holds, so an opt-in folder is chosen for what it gives rather than guessed from its
name.

`specs/` arrives holding only its index. The grouping inside it — by bounded context, by backend and frontend, or by whatever a project actually has — is the
project's own, and the index carries a proposed layout to reshape rather than a tree to fill in. What the scaffold fixes is the mechanism that keeps any
grouping readable: one capability per file, an index in every folder, the path as the capability's identifier, and tasks beside their spec.

Skills and tools live in the skills folder, so both questions are skipped and both selections are emptied when `skills` is not among the folders.

### Re-running against an existing install

Every menu lists everything this version ships, whatever the install already has; the skills question names the count, because the menu scrolls once it is
taller than the terminal. What starts ticked is what the install already has, plus anything a first scaffold would tick that the install has never been offered,
so a skill added in a later release arrives with the upgrade while one declined earlier is not quietly reinstated. Each run records what it offered in
`.ai-scaffold.offered` inside the AI folder. An install from before that record cannot tell the two apart, so its first update ticks every default it lacks.

Unticking a folder, skill or tool that is installed removes it, but only when every file in it is still what this version writes, generated index regions aside.
A folder or skill holding a file the developer changed or added is kept whole, and the run names the changed files so it can be deleted by hand. A file an older
version wrote counts as changed, so removing it from an older install is a manual step. A tool takes its installed extras with it.

### Skills loaded in every session

Most skills are read when a task matches them. A few are about how to answer at all — how plainly to write, how much to say — and those are useless if they
arrive after the answer. `--autoload` names installed skills that a session loads whether or not anything matches. A tool counts, since it installs a skill
under its own name, so `rtk` or `ponytail` can be loaded as well. The answer is written twice, because no single mechanism is portable:

- **`CLAUDE.md` imports the skill**, as `@.ai/skills/<name>/SKILL.md`. Claude Code expands an import into the session at launch, which is the only mechanism
  here that actually guarantees loading. Imports nest four hops deep, and the scaffold's `CLAUDE.md` already spends one on `@AGENTS.md`.
- **`AGENTS.md` names the same skills** in a generated region, for every harness that expands no imports. That is a pointer, so it is advisory.

Nothing else is written: no harness setting, no fourth file. A `CLAUDE.md` this tool wrote is updated in its generated region alone, so lines a developer added
around it survive; a `CLAUDE.md` it did not write is a collision and blocks the run as before.

The cost is real and `init` prints it when the choice is made, because an autoloaded skill is paid for in every session forever. For scale: the guide itself is
under 500 words, while `i-have-adhd` is about 1,200 and `simple-english` about 3,700. Two of them can be ten times the always-loaded budget, which is a fine
trade if that is the behaviour you want in every answer, and a poor one by accident.

### Skills

Its own skills are installed unless the selection excludes them; an external skill is installed only when it is named. Both are offered in one menu.

| Skill                    | Source    | What it does                                                | Offers                                          |
| ------------------------ | --------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `adding-commands`        | this tool | Record how a project command must be invoked                | —                                               |
| `adding-context`         | this tool | Add and organize curated context documents under `context/` | —                                               |
| `design`                 | this tool | Turn research or a request into an approved spec            | —                                               |
| `git-flow`               | this tool | Committing, branching, and commit hygiene                   | `project-prefixes`, `agent-info`, `no-gpg-sign` |
| `handoff`                | this tool | Write or resume a handoff for work in progress              | —                                               |
| `implement`              | this tool | Build an approved spec one task at a time                   | —                                               |
| `migrate-specs-*`        | this tool | Convert specs to or from OpenSpec and Spec Kit              | —                                               |
| `research`               | this tool | Survey options and write a dated research document          | —                                               |
| `writing-project-docs`   | this tool | Write and review Markdown under the AI folder               | `uv-formatter`, `formatter-config`              |
| `documentation-and-adrs` | external  | Architecture decision records                               | —                                               |
| `humanizer`              | external  | Removes AI-sounding prose                                   | —                                               |
| `i-have-adhd`            | external  | Direct, action-first answers                                | —                                               |
| `simple-english`         | external  | Plain technical English                                     | —                                               |

### Tools

No tool is installed unless it is named. A tool that is a program rather than files is never downloaded or executed; only the skill recording how this project
uses it is installed, and `init` warns when the program is missing.

| Tool       | What it does           | Extras                                                                                 | Needs installed |
| ---------- | ---------------------- | -------------------------------------------------------------------------------------- | --------------- |
| `ponytail` | Writes less code       | `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help` | —               |
| `rtk`      | Shrinks command output | —                                                                                      | `rtk` on `PATH` |

Who wrote each external skill and tool, under which licence, is listed in [Credits](../README.md#credits). The shipped payload is the source of truth: this
tool's own skills are the directories under `templates/.ai/skills/`, and the external ones come from [`providers.json`](../providers.json).

## Per-skill choices

One question — **Customise advanced options?**, defaulting to no — opens these, and only for selected providers that have something to decide. A selection with
nothing to customise is never offered it.

| Setting        | Flag                      | Asked as                                                                                  | Default                                           |
| -------------- | ------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Skill options  | `--options`               | one confirm per option, e.g. `git-flow`: Should commits record the agent that wrote them? | every option off                                  |
| Bundled extras | `--extras`, `--no-extras` | Which extra `<provider>` skills should be installed?                                      | none; a provider's core skill is always installed |

An extra is rejected unless the provider bundling it was selected. An option only takes effect on the run that writes the skill file it governs, so `--update`
does not re-ask about a skill that is already installed.

A skill may offer more than one choice, and each is asked separately:

| Option             | Skill                  | Off (the default)                                     | On                                                           |
| ------------------ | ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `project-prefixes` | `git-flow`             | Conventional Commits types (`feat`, `fix`, `docs`, …) | this project's own prefixes (`chore`, `fix`, `feature`)      |
| `agent-info`       | `git-flow`             | the agent is named nowhere in a commit                | commits name the agent and carry a `Co-Authored-By:` trailer |
| `no-gpg-sign`      | `git-flow`             | commit normally; signing is the git config's call     | every commit passes `--no-gpg-sign`                          |
| `uv-formatter`     | `writing-project-docs` | `npx prettier@3` formats Markdown                     | `uvx --with mdformat-gfm mdformat` formats it instead        |
| `formatter-config` | `writing-project-docs` | no config file is written                             | `.prettierrc` or `.mdformat.toml` inside the AI folder       |

Every option is off unless it is named, which is why each is named for the departure from its default rather than for the default itself. Signing is on unless
`no-gpg-sign` says otherwise; the option exists for a machine that has no signing key, and the installed skill then says so rather than leaving an agent to
discover it when a commit fails.

## Repository integration

| Setting                              | Flag                            | Asked as                                   | Default |
| ------------------------------------ | ------------------------------- | ------------------------------------------ | ------- |
| Ignore the AI folder in git          | `--gitignore`, `--no-gitignore` | Exclude `.ai` from git?                    | no      |
| `CLAUDE.md` referencing `@AGENTS.md` | `--claude-md`, `--no-claude-md` | Create CLAUDE.md (referencing @AGENTS.md)? | yes     |

These two settings, plus `AGENTS.md` itself, are the whole of what `init` writes outside the AI folder — the entry point, the redirect a harness needs to find
it, and one line naming the folder. Everything else lands inside the folder you chose.

The boundary is deliberate and enforced by a test. `init` writes nothing that configures the project's toolchain, such as a `.prettierrc`, an `.editorconfig` or
a `package.json` script, because those govern the whole repository rather than its agent material and a target may already have its own. It writes nothing that
executes either — no git hook, no CI workflow, no harness hook settings. Where a convention needs a tool, the skill states the command to run with its flags, so
a scaffolded repository needs no configuration file for it.

The folder is **not** ignored by default, and that default is load-bearing. A handoff exists so a cleared session or a second machine can resume the work; a
spec, its tasks, a research document and the commands table are what the rest of the team and the next session read. All of them live inside the AI folder, so
ignoring it keeps every one of them on one machine. `--gitignore` is still there for a developer who wants a scratch folder rather than a shared one, and the
`.gitignore` inside the AI folder keeps `*.local.md` out of git either way, so the machine-local environment file never travels even when the folder does.

The developer's own layer on top of `AGENTS.md` lives there for the same reason: `AGENTS.md` tells an agent to read `.ai/AGENTS.local.md` when it exists, and
the pattern that ignores the environment file ignores it too. At the repository root it would need a second line in the root `.gitignore`, which the boundary
does not allow.

`.gitignore` is appended to rather than rewritten, and only when the folder is not already ignored. `CLAUDE.md` is a one-line pointer at `@AGENTS.md`; an
existing one is left alone unless the run is a re-scaffold.

## Config file

`init` reads `ai-scaffold.yaml` or `ai-scaffold.yml` from the target directory when one is there, and `--config <path>` names a file anywhere. It answers the
questions before the flow starts, so a question whose answer is in the file is never asked.

| Setting     | Flag              | Asked as  | Default                                                              |
| ----------- | ----------------- | --------- | -------------------------------------------------------------------- |
| Config file | `--config <path>` | not asked | `ai-scaffold.yaml` or `ai-scaffold.yml` in the target, if one exists |

Each key is the flag of the same name, and its value has the shape that flag implies:

| Key                                                                         | Shape                        | Sets                       |
| --------------------------------------------------------------------------- | ---------------------------- | -------------------------- |
| `folder`                                                                    | text                         | `--folder`                 |
| `about`                                                                     | text, may span lines         | `--about`                  |
| `folders`, `skills`, `tools`, `options`, `extras`                           | list of names                | the list flag of that name |
| `gitignore`, `track-version`, `claude-md`, `backup`, `migrate-instructions` | `true`/`false`               | the flag of that name      |
| `mode`                                                                      | `update` or `fresh`          | `--update` / `--fresh`     |
| `wrap`                                                                      | column count, or `no-reflow` | `--wrap`                   |
| `environment`                                                               | text, may span lines         | `--environment`            |

```yaml
folder: .ai
about: |
  A developer productivity tool.

  Multi-line, because a description is prose rather than a flag value.
folders: [context, prompts, skills, templates]
skills:
  - git-flow
  - writing-project-docs
tools: [ponytail]
extras: [ponytail-review]
options: [agent-info]
gitignore: true
claude-md: true
```

[`ai-scaffold-full.yaml`](../ai-scaffold-full.yaml) in the repository root carries every setting at once, with each shipped folder, skill, tool, extra and
option named and commented. Copy it, rename it to `ai-scaffold.yaml`, and delete the parts that should still be asked.

Rules that keep a file from surprising anyone:

- A flag beats the file. `--skills none` overrides a `skills:` list rather than merging with it.
- An empty list is an answer (`skills: []` installs none); a key with no value at all is not (`folder:` leaves the folder name to be asked).
- An unknown key is an error naming the key and listing the known ones, rather than a setting that silently does nothing.
- Run-mode flags (`-y`, `--dry-run`, `--force`) are not config keys. They describe one invocation, not the shape of the repository.
- A file found on its own is for a first scaffold. Beside a tree that is already scaffolded, `init` refuses to run until the file is deleted or named with
  `--config`, interactive or not.

The last rule is there because a file found on its own answers questions nobody sees being asked. Beside an existing tree it is either a layout someone pinned,
which a re-run must not override, or a leftover, which must not steer one, and `init` cannot tell which. Deleting it brings every menu back, ticked with what
the install has; `--config ai-scaffold.yaml` applies it as written. `init` only ever reads the file, so write one for the first scaffold and delete it
afterwards, or keep it inside the AI folder and always pass it with `--config`, for example as `.ai/ai-scaffold.yaml`.

## Run mode

| Setting                  | Flag                                                  | Asked as                                                     | Default                                                                                                             |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Existing install         | `--update`, `--fresh` (`--rescaffold`)                | Update it or re-scaffold fresh?                              | asked when an install is found; `update` non-interactively                                                          |
| Overwrite existing files | `--force`                                             | not asked                                                    | off; implies `--fresh`                                                                                              |
| Back up before replacing | `--backup`, `--no-backup`                             | Back up the current setup to `.ai/.scaffold-backup` first?   | yes; asked on any run over an existing setup; non-interactively, only `--fresh` backs up unless `--backup` is given |
| Migration instructions   | `--migrate-instructions`, `--no-migrate-instructions` | Add AGENT_AISCAFFOLD_MIGRATE_INSTRUCTIONS.md to the backup…? | yes; asked only when a fresh run backs up                                                                           |
| Accept every default     | `-y`, `--yes`                                         | not asked                                                    | off; interactive whenever the session has a TTY                                                                     |
| Report without writing   | `--dry-run`                                           | not asked                                                    | off                                                                                                                 |

`--update` and `--fresh` cannot be combined. Neither mode deletes a file the scaffold does not ship, nor one a developer changed.

An update over an existing setup can take the same backup. It replaces nothing, but it removes whatever was unticked and rewrites generated regions, so
interactively it asks with yes preselected. A non-interactive update backs up only with `--backup`, because each repeated run would otherwise stop on the backup
the previous one left. An update writes no migration instructions, since nothing it replaced needs carrying back.

A fresh run over an existing setup first copies it into `.ai/.scaffold-backup/`, laid out as the repository root was: `AGENTS.md`, `CLAUDE.md`, and the old AI
folder under its own name. The copy is taken before anything is replaced, and nothing rewrites it afterwards, since indexes skip dot-folders. Its
`AGENT_AISCAFFOLD_MIGRATE_INSTRUCTIONS.md` tells an agent how to carry the project's own content into the new files: which differences to list, what to copy,
merge or drop, how to regenerate the indexes, and to ask before deleting the backup. A run that finds a backup already there stops before writing anything,
because a second backup would replace the only copy of a setup nobody has migrated yet; migrate and delete it, or pass `--no-backup`.

| Exit code | Meaning                                                                            |
| --------- | ---------------------------------------------------------------------------------- |
| `0`       | Completed.                                                                         |
| `1`       | Refused: files exist outside recognized agent tooling and `--fresh` was not given. |
| `2`       | Arguments were unusable; nothing was attempted.                                    |

## Related

[How it works](how-it-works.md) covers what `init` does to the files it writes: [generated regions](how-it-works.md#generated-regions),
[skill options](how-it-works.md#skill-options), and [guarded prose](how-it-works.md#guarded-prose). The README describes
[external skills and tools](../README.md#external-skills-and-tools).
