# Scaffolding a project with a coding agent

**Purpose.** A prompt to give a coding agent in another repository, so it sets up or updates that repository's `ai-scaffold` tree without inventing what it
cannot know. Status: `Current`.

## When to use it

Running `ai-scaffold init` yourself is enough for a new, empty repository. An agent earns its place in a repository that already has history, a README and often
older agent files: it can read those, propose the answers `init` asks for, move old guidance into the right places and fill the placeholders from facts in the
repository. The prompt keeps it from doing the parts that need you — choosing folders and skills, describing the project — without asking first.

## The prompt

Paste it as the agent's task, from the root of the target repository.

```text
Set up or update this repository's agent tooling with ai-scaffold. Work on a new branch; do not push.

1. Survey first. Read AGENTS.md, CLAUDE.md and any existing agent folder (.ai/, ai/, .cursor/,
   .github/copilot-instructions.md) if present. Run `git check-ignore -v .ai CLAUDE.md`: a global
   gitignore may exclude them. If so, report it and propose `!.ai/` and `!CLAUDE.md` negations in this
   repository's .gitignore.
2. Propose the choices and wait for my approval. Write them as ai-scaffold.yaml in the repository root,
   starting from https://raw.githubusercontent.com/StevenChoo/ai-scaffold/master/ai-scaffold-full.yaml:
   `about` (from the README, not invented), `environment` constraints, folders, skills, tools, extras,
   autoload, options, wrap. Offer the opt-in folders (commands, environments, handoffs, research, specs)
   where they fit this project, and say why for each. Autoload names the skills and tools read in
   every session; keep it short, since each one is paid for in every session.
3. Run `npx @stevenchoo/ai-scaffold@latest init . --config ai-scaffold.yaml --dry-run`, show me the
   plan, then run it without --dry-run. An existing install is updated, never replaced, unless I ask
   for --fresh.
4. Fill every <placeholder> the tool left in the AI folder; `grep -rn '<placeholder>' .ai` lists them.
   They include context/project.md, context/environment.md (deployed environments, constraints), the
   commands table and installed tool skills such as skills/rtk/SKILL.md. Fill them from facts in this
   repository, never guessed: a skill names only commands this repository has.
   Move useful content from any old agent files into the right place instead of duplicating it, and
   mark what you could not determine as open rather than inventing it.
5. This machine: if a sandbox describes itself (AgentJail writes mac/ or ubuntu/agent-context/sandbox.md),
   copy that description verbatim into .ai/environments/ with a profile beside it, and write the one-line
   pointer .ai/context/environment.local.md. Never commit credentials, tokens or personal paths.
6. Verify: re-run the init command with --update; it must change nothing. Then delete ai-scaffold.yaml:
   it was for this setup, and a later run refuses to start beside it. `git status` must show every
   new file under the AI folder. Format the Markdown the way the writing-project-docs skill says.
   Commit following the installed git-flow skill, then report what you chose, what you filled in and
   what is still open.
```

## Why it is shaped this way

- **The agent proposes and you decide.** Folder and skill choices, and the `about` text, are yours; an agent that answers them alone writes a tree that looks
  settled and is not.
- **A dry run before any file is written**, and an update run afterwards that must change nothing — the same check that shows whether a repository is in step
  with the tool.
- **A global gitignore is checked first.** One that excludes `.ai` or `CLAUDE.md` silently leaves new files out of git, so a second machine never receives them.
- **Placeholders are filled from the repository or marked open.** A placeholder that reads like a fact is worse than an empty file.

## Choices worth knowing

- **Delete `ai-scaffold.yaml` once the setup is done.** It answers questions without showing them, so a later update that found it could override a choice or
  apply a stale one; `init` refuses to run beside it instead. Keep it only when the layout should be pinned, inside the AI folder, and pass it with `--config`
  on every run.
- **A sandbox without network access needs a local build.** `npx` fetches on first use. Where that fails, run a checkout's build instead,
  `node <ai-scaffold>/dist/cli.js init .`, after granting the sandbox read access to that checkout.

Every setting the config file accepts is in [`configuration.md`](configuration.md).
