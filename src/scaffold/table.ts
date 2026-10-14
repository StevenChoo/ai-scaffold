/**
 * Markdown tables written the way a formatter would write them.
 *
 * A generated region is rewritten on every run, and a repository that formats its Markdown
 * rewrites it again afterwards. Padding every cell to its column's width, as Prettier does,
 * makes the two agree, so neither run leaves a diff behind for the other to undo.
 */
export function renderTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => (row[column] ?? "").length)));
  const line = (values: readonly string[]): string =>
    `| ${values.map((value, column) => value.padEnd(widths[column] ?? 0)).join(" | ")} |`;
  return [line(header), `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`, ...rows.map(line)].join("\n");
}
