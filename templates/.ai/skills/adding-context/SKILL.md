---
name: adding-context
description: >-
  Add, organize, or refine curated context documents under .ai/context/ to provide an agent with high-impact, non-redundant project knowledge and external repository mappings.
---

# Adding and curating project context

Curate durable, high-signal facts about the repository under `.ai/context/` to enrich LLM sessions without overloading the context window.

## Core principles

### 1. Separate into focused topic files
Splitting context across distinct, focused files is significantly more effective than maintaining a single monolithic document. An agent can inspect the index and read only the specific context file relevant to its active task.

Examples of focused context files:
- `application.md` — Product purpose, boundaries, and domain terminology.
- `team.md` — Engineering philosophy, quality expectations, and decision principles.
- `related-projects.md` — Mappings and references to external repositories, upstream services, or sister tools.
- `architecture.md` — System architecture, subsystems, and invariants.
- `<domain>.md` — Deep domain-specific rules or invariants for complex areas.

### 2. Keep content minimal and high-impact
Every sentence in a context file must earn its token footprint. Include only the essential facts that directly impact an agent's technical choices, design trade-offs, and boundary enforcement.

- Avoid narrative filler, motivational text, or broad generic guidance.
- State clear constraints, non-goals, and invariants.

### 3. Do not duplicate in-code information
Context files exist to provide knowledge that code alone cannot convey.

- If information is already explicitly declared in `package.json`, schema definitions, type definitions, or standard directory structure, do not repeat it in `.ai/context/`.
- Focus on *why* choices were made, *what* is intentionally omitted, and *hidden constraints* that cannot be discovered by searching code.

### 4. Keep environment policy and machine fact apart

`environment.md` holds what is true of the project everywhere: where it runs, what an agent may do there, what is deliberately unavailable. Its **Local
development** section is generated from the repository on every run, so change the project rather than that region — it is the one place a context file may
restate `package.json`, because it cannot drift from it.

What one machine or sandbox has installed is not policy. It goes in `environment.local.md`, which is never committed, never indexed and never edited by an
agent. "The project does not use Docker" belongs in `environment.md`; "Docker is not installed here" belongs in the local file.

<!-- agent-generated:requires environments/_index.md -->
To set up a machine whose setup is shared with another, find or write its profile in `.ai/environments/` — named for the setup, such as `macos-sandbox.md`,
and holding what it has installed, what it restricts and what to do instead — then ask the developer to write the one-line pointer
`This machine: environments/macos-sandbox.md` to `environment.local.md`. A profile is committed, so it never holds a credential, a token's contents or a
personal path; those stay in the local file.

### 5. Map external references and related projects
When tasks frequently reference external source code, sister repositories, or upstream libraries:

- Create `.ai/context/related-projects.md` using the context template schema.
- Document the relationship (upstream, downstream, sibling, reference), the purpose of the reference, and how local paths or checkouts are configured (e.g., in `.ai/AGENTS.local.md`).
- This makes the agent aware of cross-project boundaries and relationships without confusing foreign code with this repository.

## Workflow: Adding a new context file

1. **Check existing context**: Read `.ai/context/_index.md` to see if an existing file already covers the subject or can be updated.
<!-- agent-generated:requires templates/context.template.md -->
2. **Draft using the template**: Copy `.ai/templates/context.template.md` to `.ai/context/<topic>.md`.
3. **Write concise content**: Fill in purpose, core concepts, rules/constraints, and references.
4. **Update the index**: Add a row for the new file in `.ai/context/_index.md` in alphabetical order, with appropriate status (`Draft` or `Current`) and a one-line summary.
