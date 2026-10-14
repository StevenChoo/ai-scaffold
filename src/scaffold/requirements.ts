/**
 * Guarded prose: lines that are only true when the thing they name was scaffolded.
 *
 * Once any folder or skill can be declined, shipped prose that points at one becomes a
 * dangling reference in the repositories that declined it. A guard marks such a block with
 * what it depends on, and the block is dropped when that dependency is not written.
 *
 *     <!-- agent-generated:requires templates/_index.template.md -->
 *     - Follow `.ai/templates/_index.template.md` for index structure.
 *
 * A guard names a condition. A path condition is relative to the AI folder, so it does not
 * change when that folder is renamed. An `option:` condition is answered by a choice the
 * developer made rather than by a file. Either form may be negated with `!`, which is how a
 * document carries both sides of a choice and keeps only the side that applies:
 *
 *     <!-- agent-generated:requires option:agent-info -->
 *     Record the agent as a co-author.
 *
 *     <!-- agent-generated:requires !option:agent-info -->
 *     Do not record the agent as an author.
 *
 * The guard itself never reaches a scaffolded repository: it is resolved at write time and
 * the comment is removed either way.
 */

const GUARD = /^\s*<!--\s*agent-generated:requires\s+(\S+)\s*-->\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/** Whether a line continues the list item above it rather than starting something new. */
function isContinuation(line: string | undefined): boolean {
  return line !== undefined && /^\s+\S/.test(line);
}

/**
 * Resolves every guard in a document against what the scaffold is writing.
 *
 * `isSatisfied` receives the condition a guard names, with any leading `!` already removed.
 */
export function applyRequirements(
  content: string,
  isSatisfied: (condition: string) => boolean,
): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const guard = GUARD.exec(line);
    if (!guard?.[1]) {
      kept.push(line);
      continue;
    }

    const negated = guard[1].startsWith("!");
    const condition = negated ? guard[1].slice(1) : guard[1];
    const holds = negated ? !isSatisfied(condition) : isSatisfied(condition);

    const start = index + 1;
    const first = lines[start];
    if (first === undefined) {
      break; // A guard with nothing after it guards nothing.
    }

    // A guarded list item is one item; anything else runs to the end of its paragraph.
    const guardsListItem = LIST_ITEM.test(first);
    let end = start;
    while (
      end + 1 < lines.length &&
      (guardsListItem ? isContinuation(lines[end + 1]) : (lines[end + 1] ?? "").trim() !== "")
    ) {
      end++;
    }

    if (holds) {
      for (let line = start; line <= end; line++) {
        kept.push(lines[line] ?? "");
      }
    } else if (!guardsListItem && (lines[end + 1] ?? "").trim() === "") {
      // Take the paragraph's trailing blank line too, so no double gap is left behind.
      end++;
    }

    index = end;
  }

  return kept.join("\n");
}

/** Options a scaffold was configured with, addressed by guards as `option:<name>`. */
export const OPTION_PREFIX = "option:";

/**
 * Builds the predicate a guard is resolved against.
 *
 * A path condition holds when that path is written, or is a directory containing something
 * that is. An `option:` condition holds when the named option was chosen.
 */
export function conditionsFor(
  writtenPaths: Iterable<string>,
  chosenOptions: Iterable<string> = [],
): (condition: string) => boolean {
  const options = new Set(chosenOptions);
  const present = presenceOf(writtenPaths);
  return (condition: string): boolean =>
    condition.startsWith(OPTION_PREFIX)
      ? options.has(condition.slice(OPTION_PREFIX.length))
      : present(condition);
}

/** Whether a path is among those written, or is a directory holding one that is. */
export function presenceOf(writtenPaths: Iterable<string>): (path: string) => boolean {
  const paths = new Set<string>();
  for (const written of writtenPaths) {
    const normalized = written.split(/[\\/]/).join("/");
    paths.add(normalized);
    const segments = normalized.split("/");
    for (let depth = 1; depth < segments.length; depth++) {
      paths.add(segments.slice(0, depth).join("/"));
    }
  }
  return (path: string): boolean => paths.has(path.replace(/^\/+|\/+$/g, ""));
}
