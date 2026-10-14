/**
 * How wide Markdown prose is written, as one setting shared by the flag, the config file and
 * the emitted convention.
 *
 * A width is a number of columns; `no-reflow` means one line per paragraph and no hard breaks
 * at all. Both are written as text, because a setting that is sometimes a number and sometimes
 * a word is a string in every file format that has to carry it.
 *
 * The value reaches the scaffolded repository twice: as the number substituted into the
 * convention it writes, and as the `markdown-reflow` condition that decides which of the two
 * wordings survives.
 */

import { UsageError } from "../result.js";

/** The value that turns hard wrapping off entirely. */
export const NO_REFLOW = "no-reflow";

/** The width used when nobody says otherwise. */
export const DEFAULT_WRAP = "160";

/** The condition guarded prose uses to tell the two wordings apart. */
export const REFLOW_OPTION = "markdown-reflow";

/**
 * The placeholders emitted files carry, and what each stands for.
 *
 * A command line is not a width, so the setting reaches each formatter in that formatter's own
 * spelling rather than as a number every reader has to translate.
 */
const PLACEHOLDERS = {
  columns: /\{wrap-columns\}/g,
  prettier: /\{prettier-wrap\}/g,
  mdformat: /\{mdformat-wrap\}/g,
} as const;

/**
 * Prettier stops padding a table whose row is wider than the print width, and under
 * `--prose-wrap never` that limit still applies although prose is not wrapped at all. A wide
 * print width there governs tables only, which is the reason it is not the chosen width.
 */
const NO_REFLOW_TABLE_WIDTH = "400";

/**
 * Validates a wrap setting.
 *
 * `source` names where the value came from, so the message points at the flag or the file that
 * carries it rather than at the setting in the abstract.
 */
export function parseWrapSetting(raw: string, source: string): string {
  const value = raw.trim();
  if (value === NO_REFLOW) {
    return value;
  }
  // A width narrow enough to break a table heading is a typo, not a preference.
  if (!/^\d+$/.test(value) || Number(value) < 40) {
    throw new UsageError(`${source}: expected a column count of 40 or more, or "${NO_REFLOW}"`);
  }
  return String(Number(value));
}

/** Whether this setting asks for prose to be reflowed at all. */
export function reflows(wrap: string): boolean {
  return wrap !== NO_REFLOW;
}

/** The skill that owns the Markdown convention, and therefore its optional config file. */
export const FORMATTER_SKILL = "writing-project-docs";

/** The option asking for a formatter config file beside the convention. */
export const FORMATTER_CONFIG_OPTION = "formatter-config";

/** The option choosing uv over npx, which decides which formatter is configured. */
const UV_OPTION = "uv-formatter";

/**
 * The formatter config a scaffold writes when asked, carrying the same settings the skill's
 * command states.
 *
 * Nothing is written unless the developer opts in, and what is written lands inside the AI
 * folder, where it governs the agent material and nothing else. The command keeps its flags
 * either way, so the two cannot disagree about a file they both apply to: a flag wins.
 */
export function formatterConfigFor(
  chosenOptions: Iterable<string>,
  wrap: string,
): { readonly name: string; readonly contents: string } | undefined {
  const chosen = new Set(chosenOptions);
  if (!chosen.has(FORMATTER_CONFIG_OPTION)) {
    return undefined;
  }

  if (chosen.has(UV_OPTION)) {
    // mdformat reads its own file, and takes the same two answers the command takes.
    return {
      name: ".mdformat.toml",
      contents: `# Written by ai-scaffold. Governs Markdown in this folder.\nwrap = ${reflows(wrap) ? wrap : '"no"'}\n`,
    };
  }

  const options = reflows(wrap)
    ? { proseWrap: "always", printWidth: Number(wrap) }
    : { proseWrap: "never", printWidth: Number(NO_REFLOW_TABLE_WIDTH) };
  return {
    name: ".prettierrc",
    contents: `${JSON.stringify({ overrides: [{ files: "*.md", options }] }, null, 2)}\n`,
  };
}

/**
 * Substitutes the setting into emitted content, in each form the templates use.
 *
 * Under `no-reflow` there is no column count for `{wrap-columns}` to stand for, but every
 * sentence carrying it is dropped by its guard, so nothing is left to replace.
 */
export function applyWrapWidth(content: string, wrap: string): string {
  const wrapping = reflows(wrap);
  return content
    .replace(PLACEHOLDERS.columns, wrapping ? wrap : "")
    .replace(
      PLACEHOLDERS.prettier,
      wrapping
        ? `--prose-wrap always --print-width ${wrap}`
        : `--prose-wrap never --print-width ${NO_REFLOW_TABLE_WIDTH}`,
    )
    .replace(PLACEHOLDERS.mdformat, wrapping ? wrap : "no");
}
