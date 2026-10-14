/**
 * A copy of the setup a fresh scaffold is about to replace, and the instructions an agent follows
 * to carry the project's own content from that copy into the new tree.
 *
 * The backup lives inside the AI folder, the only ground this tool owns, under a dot-name so no
 * index lists it. It mirrors the repository root: `AGENTS.md`, `CLAUDE.md`, and the old AI folder
 * under its own name.
 */

import { existsSync } from "node:fs";
import { cp, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const BACKUP_FOLDER = ".scaffold-backup";
export const MIGRATE_INSTRUCTIONS = "AGENT_AISCAFFOLD_MIGRATE_INSTRUCTIONS.md";

/** Root files a fresh scaffold replaces. */
const ROOT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

/**
 * Copies the current setup into `backupRoot`, returning what was copied relative to the target.
 *
 * `oldFolder` is the AI folder being replaced, if there is one. The backup folder itself is
 * skipped, since it sits inside that folder.
 */
export async function backupScaffold(target: string, oldFolder: string | undefined, backupRoot: string): Promise<string[]> {
  const copied: string[] = [];
  for (const name of ROOT_FILES) {
    if (existsSync(join(target, name))) {
      await cp(join(target, name), join(backupRoot, name), { verbatimSymlinks: true });
      copied.push(name);
    }
  }
  if (oldFolder !== undefined && existsSync(join(target, oldFolder))) {
    for (const entry of await readdir(join(target, oldFolder))) {
      if (entry === BACKUP_FOLDER) {
        continue;
      }
      await cp(join(target, oldFolder, entry), join(backupRoot, oldFolder, entry), {
        recursive: true,
        verbatimSymlinks: true,
      });
    }
    copied.push(`${oldFolder}/`);
  }
  return copied;
}

/** The version line of a version file, or undefined when there is none to read. */
export async function readRecordedVersion(versionFile: string): Promise<string | undefined> {
  if (!existsSync(versionFile)) {
    return undefined;
  }
  return (await readFile(versionFile, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
}

export interface MigrateContext {
  /** The AI folder the fresh scaffold wrote. */
  readonly folderName: string;
  /** The AI folder that was backed up, if there was one. */
  readonly oldFolder: string | undefined;
  /** What the backup holds, relative to the backup root. */
  readonly copied: readonly string[];
  readonly previousVersion: string | undefined;
  readonly currentVersion: string;
  readonly date: string;
}

/** The instructions an agent follows to migrate a backed-up setup into the fresh one. */
export function renderMigrateInstructions(context: MigrateContext): string {
  const backup = `${context.folderName}/${BACKUP_FOLDER}`;
  const old = context.oldFolder ?? context.folderName;
  const previous = context.previousVersion ?? "unknown (the old setup predates version tracking)";
  const holds = context.copied.map((path) => `- \`${backup}/${path}\``).join("\n");
  // A renamed folder leaves the old one in place, still shaped like an install, until someone removes it.
  const renamed = context.oldFolder !== undefined && context.oldFolder !== context.folderName;
  const outside = renamed ? `, apart from removing the old \`${old}/\` folder at the end` : "";
  const cleanup = renamed ? `the backup folder and the old \`${old}/\` folder` : "the backup folder";

  return `# Migrate the previous ai-scaffold setup

On ${context.date}, \`ai-scaffold init --fresh\` replaced this repository's agent setup with the files shipped by ai-scaffold
${context.currentVersion}. The setup it replaced, from ai-scaffold ${previous}, was copied here first:

${holds || "- nothing; there was no previous setup to copy"}

Your job is to carry the project's own content from that copy into the new setup, then ask whether the copy can be deleted.
Read this whole file before changing anything.

## Rules

- **The new files are the base.** Never copy an old scaffold file back over its new version wholesale. Bring across what the
  project wrote into it, and leave what the scaffold ships.
- **Work only inside this repository**, and change nothing outside \`${context.folderName}/\`, \`AGENTS.md\` and \`CLAUDE.md\`${outside}.
- **Never edit a generated region.** Text between \`<!-- BEGIN agent-generated:… -->\` and \`<!-- END agent-generated:… -->\` is
  rewritten by the tool. Skip those regions in both the old and the new files.
- **Leave \`${backup}/\` unchanged** until the developer says to delete it. It is the only copy of the old setup.
- **Ask when unsure.** If you cannot tell whether a difference is the project's content or an older scaffold default, show the
  developer both versions and ask, rather than guessing.

## Steps

1. **List what differs.** From the repository root, run:

   \`\`\`sh
   diff -rq ${backup}/${old} ${context.folderName} -x ${BACKUP_FOLDER}
   diff -q ${backup}/AGENTS.md AGENTS.md
   diff -q ${backup}/CLAUDE.md CLAUDE.md
   \`\`\`

   Work through every line of that output. Each one is a file to migrate, merge or deliberately drop.

2. **Files only in the backup** are content the project wrote, such as context documents, prompts, specs, handoffs, research,
   command entries, profiles or its own skills. Copy each one to the same path under \`${context.folderName}/\`. If the new
   setup has moved that kind of file (check the folder's \`_index.md\` and \`AGENTS.md\`), put it where the new setup expects
   it instead. \`*.local.md\` files are machine-local: copy them back as they are.

3. **Files only in the new setup** are what this version added. Keep them. Fill in their placeholders only from what the old
   files actually say, never by invention.

4. **Files in both that differ** need a merge:
   - **Context, environment, commands and other project documents.** Keep the new structure and headings, and move the
     project's own text into it. Placeholder text in the old file is not content; drop it.
   - **\`_index.md\` files.** Keep the new **Purpose**, **Not for** and **Conventions** unless the old ones were written for this
     project. Leave the index table alone, since step 6 regenerates it.
   - **Skills shipped by ai-scaffold.** Keep the new version. If the old copy carries a deliberate local change, such as a
     project rule or a changed command, reapply that change to the new file and tell the developer you did.
   - **\`AGENTS.md\` and \`CLAUDE.md\`.** Carry over any line the project added outside the generated regions. Use the paths
     the new files name, not the old ones.

5. **Settings that live in the run, not in a file.** Choices such as skill options or autoloaded skills are recorded in the
   files they produce. If the old setup had one that the new one lacks, tell the developer which \`ai-scaffold init\` flag
   restores it rather than hand-editing a skill to imitate it.

6. **Regenerate the indexes:** run \`ai-scaffold init . --folder ${context.folderName} --update -y\` from the repository root
   (or \`npx @stevenchoo/ai-scaffold\` in place of \`ai-scaffold\` if it is not installed; the unscoped name is another
   package). Keep \`--folder\`: without it, an update can pick another folder that looks like an install. An update fills
   gaps and rewrites only the generated regions, so it does not undo your migration.

7. **Report.** Give the developer a short list of every backed-up file: migrated, merged, or dropped, with the reason for
   each drop.

## Finally

When every file in the backup is accounted for, ask the developer exactly this:

> Everything in \`${backup}/\` has been migrated. Should I delete ${cleanup}?

Delete only after an explicit yes, with \`git rm -r\` for anything tracked so it stays recoverable from history. If the answer
is no, leave it in place. The backup is ignored by every index and does nothing until someone removes it.
`;
}
