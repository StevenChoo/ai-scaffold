/**
 * Removing what a developer unticked on a re-run, without losing anything they wrote.
 *
 * A folder or skill is removed only when every file in it is still what this version would
 * write. Generated regions are ignored in that comparison, because reindexing rewrites them on
 * every run and they say nothing about whether a person changed the file.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const GENERATED_REGION = /(<!-- BEGIN agent-generated:([\w-]+) -->)[\s\S]*?(<!-- END agent-generated:\2 -->)/g;

/** The text with every generated region emptied, so two files compare on what a person wrote. */
export function withoutGeneratedRegions(text: string): string {
  return text.replace(GENERATED_REGION, "$1$3");
}

/**
 * Files under `directory` that differ from the shipped `reference`, or that it does not ship at
 * all, as paths relative to `target`. An empty list means the directory is safe to remove.
 */
export async function changedFiles(
  target: string,
  directory: string,
  reference: ReadonlyMap<string, Buffer>,
): Promise<string[]> {
  const changed: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const path = relative(target, join(entry.parentPath, entry.name));
    const shipped = reference.get(path);
    const actual = await readFile(join(target, path), "utf8");
    if (shipped === undefined || withoutGeneratedRegions(actual) !== withoutGeneratedRegions(shipped.toString("utf8"))) {
      changed.push(path);
    }
  }
  return changed.sort();
}
