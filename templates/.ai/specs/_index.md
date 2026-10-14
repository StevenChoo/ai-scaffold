# Specs index

**Purpose.** What this project is supposed to do, one capability per file, grouped however this project's own structure makes sense. A spec is the agreed
behaviour an implementation is built and reviewed against. Open this index when designing or reviewing a capability; an implementation opens the one spec it is
building and its task file, not the tree.

**Not for.** How something is built, which belongs in the code and its comments; durable facts about the project, which belong in
[`context/`](../context/_index.md); and surveys of options not yet chosen, which belong with this project's research. A project that already uses a spec
framework such as OpenSpec or Spec Kit keeps its own tree and declines this folder: one tree is the source of truth, never two. The migration skills convert
between them in either direction.

**Conventions.**

- **The grouping is this project's own.** The layout below is a starting point, not a schema. Reshape it into whatever bounded contexts this project actually
  has, and create a group when the specs arrive rather than up front.

  ```text
  specs/
    _common/          cross-cutting: auth, errors, observability, testing
    backend/<domain>/ one folder per bounded context
    frontend/<area>/  one folder per area
  ```

- **One capability per file.** A spec covering a whole feature is the document nobody reviews and nobody updates. The path from this folder is the capability's
  identifier, so another document can cite it and a move is a rename.
- **Every folder carries an `_index.md`**, whose table lists its children. That is what keeps a large tree navigable without anyone maintaining a map of it.
- **Keep it shallow.** Four levels below this folder is deep enough for any project; past that the grouping itself is the problem.
- **Tasks live beside their spec**, as `<capability>.tasks.md` next to `<capability>.md`, so the two move together and cannot drift.
- **Status is the vocabulary the index template already fixes:** `Draft` while a spec is being written, `Proposed` while it awaits a decision, `Current` once it
  is the truth, `Superseded` when another spec replaces it.

## Index

<!-- BEGIN agent-generated:index-table -->

| File | Status   | Summary                                                     |
| ---- | -------- | ----------------------------------------------------------- |
| —    | Reserved | No specs yet. Add one when behaviour is worth pinning down. |

<!-- END agent-generated:index-table -->
