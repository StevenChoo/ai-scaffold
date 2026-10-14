# ai-scaffold

_Give a repository the structure AI coding agents actually navigate._

One command turns a project with no agent guidance into one with an `AGENTS.md` entry point, an indexed `.ai/` tree of curated context, reusable skills, and
templates.

```sh
npx @stevenchoo/ai-scaffold init
```

```text
┌  ai-scaffold
│
◇  Name for AI tool folder:
│  .ai
│
◇  What is the project about? (press Enter twice to submit, or submit empty to skip)
│  A developer productivity tool
│
◇  Which of these should load in every session?
│  none
│
◇  Exclude .ai from git? Handoffs, specs and research would then stay on this machine.
│  No
│
◇  Create CLAUDE.md (referencing @AGENTS.md)?
│  Yes
│
◇  Scaffolded 16 files into /home/dev/my-project
└  Done!
```

## Why

Agents work far better with curated, navigable context than with a raw repository. Assembling that context is repetitive, easy to do badly, and reinvented
slightly differently in every project — so it gets skipped, or copied from a previous repo and left to drift.

The structure here is not novel. Its value is that it is consistent, indexed, and reproducible: an agent that has learned one scaffolded repository can navigate
the next one without being told how.

## What it creates

```text
AGENTS.md                  the entry point an agent reads first
CLAUDE.md                  optional compatibility shortcut (@AGENTS.md)
.ai/                       agent resources folder (customizable)
  _index.md                the agent-facing tree, indexed
  commands/                how this project's commands must be invoked (opt-in)
  context/                 durable facts: what this is, who it serves, what surrounds it
  environments/            one committed profile per machine setup (opt-in)
  handoffs/                the state of work in progress, for resuming a session (opt-in)
  prompts/                 reusable task prompts
  research/                dated surveys written before a decision is taken (opt-in)
  skills/                  workflow guidance, loaded when a task matches
  specs/                   what the project is supposed to do, one capability per file (opt-in)
  templates/               human-owned templates for context, skills, prompts, and indexes
```

Two ideas carry the weight.

**Every folder is indexed.** An `_index.md` names the folder's purpose, states what does _not_ belong there, and lists every direct child once with a status. An
agent can decide whether to open a folder without reading its contents — which is the difference between structure that is present and structure that is
navigable.

**Placeholders announce themselves.** Generated context files are prompts for a human to complete, marked as such and left at `Draft` status. Emitted prose that
reads like a settled statement, when nobody has decided anything, is worse than an empty file: a reader cannot tell which sentences are true.

## Usage

```sh
ai-scaffold init [target]       # interactively scaffold into a target directory (defaults to .)
ai-scaffold init -y             # use defaults non-interactively
ai-scaffold init . --dry-run    # show what would be written, write nothing
ai-scaffold init . --update     # add only what is missing, leave existing files alone
ai-scaffold init . --fresh      # replace every scaffold file with the shipped version
ai-scaffold init . --folders context,skills --skills git-flow   # scaffold a subset
```

Existing files are never overwritten unless you ask for it, and a conflict aborts the whole operation rather than leaving a half-written tree.

To have a coding agent set up or update a repository that already has history, give it the prompt in
[`docs/scaffold-with-an-agent.md`](docs/scaffold-with-an-agent.md): it surveys first, proposes the choices for your approval, and fills placeholders only from
facts in the repository.

### Running against a repository that already has agent tooling

`init` looks for an AI folder, then for an `AGENTS.md`, before it writes anything. Finding either, it says what it found and asks how to proceed:

| Found                            | What it says                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| An AI folder from a previous run | Detected an existing ai-scaffold install; update it or re-scaffold fresh?                             |
| Only an `AGENTS.md`              | It looks like the project is already using agent tooling. Would you want to update it or re-scaffold? |

**Update** adds only what is missing and leaves every existing file as it is, so a repository picks up new skills and templates without losing local edits.
**Re-scaffold fresh** replaces each file the scaffold ships. Neither mode deletes a file the scaffold does not ship, so context you wrote yourself survives
both.

The AI folder is recognized by its shape, not its name, so a tree created with `--folder .my-agent` is found again when `init` is re-run without that flag —
rather than a second tree appearing beside it. Non-interactive runs (`-y`) update by default; pass `--fresh` to replace. `--force` implies `--fresh`.

A fresh run keeps a copy of the setup it replaces in `.ai/.scaffold-backup/`, with instructions an agent follows to migrate it; see the
[configuration reference](docs/configuration.md#run-mode).

### Choosing what to scaffold

Interactive runs ask which folders the AI directory should contain and which skills to install. `--folders` and `--skills` do the same non-interactively, and
both accept `none`.

Re-running against an existing install offers every folder and skill again, with what the install has already checked, plus anything new since it was last run.
To add a skill later, re-run and select it; to remove one, untick it, and it is removed unless you changed it. See
[re-running against an existing install](docs/configuration.md#re-running-against-an-existing-install).

[`docs/configuration.md`](docs/configuration.md) lists every setting, its flag, the question that asks for it, and its default.

### Answering with a config file

A project scaffolded more than once, or a set of projects scaffolded the same way, should not have to answer the same menu each time. `init` reads
`ai-scaffold.yaml` (or `.yml`) from the target directory when it is there, and `--config <path>` names one anywhere:

```yaml
folder: .ai
about: |
  A developer productivity tool.

  Multi-line, because a description is prose and not a flag value.
folders: [context, prompts, skills, templates]
skills:
  - git-flow
  - writing-project-docs
tools: [ponytail]
extras: [ponytail-review]
options: [agent-info]
gitignore: false
claude-md: true
```

[`ai-scaffold-full.yaml`](ai-scaffold-full.yaml) is the same file with every setting spelled out and every shipped choice listed, to copy and cut down.

Every key is the flag of the same name, and a question whose answer is in the file is not asked. A flag still wins over the file, so `init --skills none`
overrides a `skills:` list rather than merging with it, and an unknown key is an error rather than a silent no-op. Run-mode flags (`-y`, `--dry-run`, `--force`)
stay on the command line, because they describe one invocation rather than the shape of the repository.

A file found on its own is for a first scaffold. Once the tree exists, `init` refuses to run beside it until you delete it, which brings the menus back, or pass
it with `--config` to apply it as written.

### External skills and tools

The skills menu offers this project's own skills and skills other people wrote, side by side, each with its author and licence in the hint. Tools have their own
menu. Both are installed into the project being scaffolded, never into a global agent directory, because projects differ in what they need and a globally
installed skill is loaded whether or not the project wants it.

```sh
ai-scaffold init . --skills git-flow,humanizer --tools ponytail
ai-scaffold init . --no-tools
```

Every external skill arrives as a complete copy: the skill, the author's `LICENSE`, and a `SOURCE.md` naming the repository, commit and author. A copy missing
any of those is refused rather than installed, since that is the condition its licence attaches to redistribution. A tool that is a program, such as
[`rtk`](https://github.com/rtk-ai/rtk), is never downloaded or executed: only the skill describing how the project uses it is installed, with a warning when the
program is not on `PATH`.

## Documentation

- [Configuration reference](docs/configuration.md): every setting, its flag, the question that asks for it, its default, and the exit codes.
- [How it works](docs/how-it-works.md): generated regions, the frontmatter a skill uses to take part, and guarded prose.
- [Scaffolding with a coding agent](docs/scaffold-with-an-agent.md): a prompt that has an agent set up or update a repository with history.
- [Contributing](CONTRIBUTING.md): building, testing, and adding an external skill.

## Credits

`ai-scaffold` installs skills and tools other people wrote. It does not claim them. Each one is copied from its upstream repository at a pinned commit, and each
copy carries the author's `LICENSE` and a `SOURCE.md` naming the repository, the commit and the author — both in this repository and in every project scaffolded
from it. Report problems with a skill upstream, not here.

<!-- prettier-ignore-start -->
<!-- BEGIN agent-generated:credits -->

| Provider | What it does | Author | Licence |
| --- | --- | --- | --- |
| [`documentation-and-adrs`](https://github.com/addyosmani/agent-skills) | Architecture decision records | Addy Osmani | MIT |
| [`humanizer`](https://github.com/blader/humanizer) | Removes AI-sounding prose | Siqi Chen | MIT |
| [`i-have-adhd`](https://github.com/ayghri/i-have-adhd) | Direct, action-first answers | Ayoub Ghriss | MIT |
| [`ponytail`](https://github.com/dietrichgebert/ponytail) | Writes less code | DietrichGebert | MIT |
| [`rtk`](https://github.com/rtk-ai/rtk) | Shrinks command output | rtk-ai | Apache-2.0 |
| [`simple-english`](https://github.com/aminblg/simpleenglish) | Plain technical English | AminBlg | MIT |

<!-- END agent-generated:credits -->
<!-- prettier-ignore-end -->

## License

[MIT](LICENSE) for the code in this repository. Vendored skills under [`vendor/`](vendor/) stay under the licences of their authors, reproduced beside each
copy.
