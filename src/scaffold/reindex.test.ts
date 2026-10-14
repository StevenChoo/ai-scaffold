/**
 * Generation of the regions that describe a tree: index tables and AGENTS.md directives.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { SCAFFOLDER_FIELDS, firstSentence, parseFrontmatter, removeFrontmatterFields } from "./catalog.js";
import { parseIndexTable, readRegion, reindexScaffold, renderIndexTable, replaceRegion } from "./reindex.js";

const TABLE = `## Index

<!-- BEGIN agent-generated:index-table -->

| File                       | Status | Summary                                     |
| -------------------------- | ------ | ------------------------------------------- |
| [\`project.md\`](project.md) | Draft  | Scope, current phase, and repository rules. |

<!-- END agent-generated:index-table -->
`;

describe("parseFrontmatter", () => {
  test("reads a plain field", () => {
    assert.equal(parseFrontmatter("---\nname: git-flow\n---\n# Title")["name"], "git-flow");
  });

  test("joins a folded scalar into one value", () => {
    const fields = parseFrontmatter("---\nname: x\ndescription: >-\n  First line.\n  Second line.\n---\n");
    assert.equal(fields["description"], "First line. Second line.");
  });

  test("reads the agents-md directive alongside other fields", () => {
    const fields = parseFrontmatter(
      "---\nname: git-flow\ndescription: >-\n  Git workflow.\nagents-md: Before committing, read {skill}.\n---\n",
    );
    assert.equal(fields["agents-md"], "Before committing, read {skill}.");
    assert.equal(fields["description"], "Git workflow.");
  });

  test("strips the quotes YAML allows around a value", () => {
    const fields = parseFrontmatter("---\nname: x\ndescription: 'Quoted text.'\n---\n");
    assert.equal(fields["description"], "Quoted text.");
  });

  test("returns nothing for a file without frontmatter", () => {
    assert.deepEqual(parseFrontmatter("# Just a heading\n"), {});
  });
});

describe("firstSentence", () => {
  test("stops at the first sentence and collapses whitespace", () => {
    assert.equal(firstSentence("One thing.  And\n  another."), "One thing.");
  });

  test("returns the whole text when there is no sentence break", () => {
    assert.equal(firstSentence("No full stop here"), "No full stop here");
  });
});

describe("index tables", () => {
  test("parses rows, keeping status and summary", () => {
    const rows = parseIndexTable(TABLE);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      label: "project.md",
      target: "project.md",
      status: "Draft",
      summary: "Scope, current phase, and repository rules.",
    });
  });

  test("parses the placeholder row of an empty folder", () => {
    const rows = parseIndexTable(TABLE.replace(/\| \[.*\n/, "| —    | Reserved | Nothing yet. |\n"));
    assert.equal(rows[0]?.target, null);
    assert.equal(rows[0]?.status, "Reserved");
  });

  test("returns nothing when the file has no generated table", () => {
    assert.deepEqual(parseIndexTable("# No table here\n"), []);
  });

  test("renders every row to the same width", () => {
    const rendered = renderIndexTable([
      { label: "a.md", target: "a.md", status: "Current", summary: "Short." },
      { label: "much-longer-name.md", target: "much-longer-name.md", status: "Draft", summary: "A considerably longer summary." },
    ]);
    const lines = rendered.split("\n");
    assert.equal(lines.length, 4, "header, separator, and one line per row");
    const widths = new Set(lines.map((line) => line.length));
    assert.equal(widths.size, 1, `rows must align, got widths ${[...widths].join(", ")}`);
  });

  test("a rendered table parses back to the rows it came from", () => {
    const rows = parseIndexTable(TABLE);
    assert.deepEqual(parseIndexTable(replaceRegion(TABLE, "index-table", renderIndexTable(rows))), rows);
  });
});

describe("derived summaries", () => {
  test("take the whole first sentence when it wraps over several lines", async () => {
    const target = await mkdtemp(join(tmpdir(), "ai-scaffold-summary-"));
    try {
      const folder = join(target, ".ai", "notes");
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "_index.md"), `# Notes\n\n${TABLE.replace(/\| \[.*\n/, "| —    | Reserved | Nothing yet. |\n")}`);
      await writeFile(
        join(folder, "generated.md"),
        "# Sandbox\n\n> Generated file.\n\n<!-- a comment\n     over two lines -->\n\nYou are running inside a sandbox on macOS: one policy\nplus another. More follows.\n",
      );
      await writeFile(join(folder, "purpose.md"), "# Folder\n\n**Purpose.** What this holds, wrapped at the\nprose width. Second sentence.\n");
      await reindexScaffold({ target, folderName: ".ai", templateAiRoot: join(target, "no-templates") });
      const rows = parseIndexTable(await readFile(join(folder, "_index.md"), "utf8"));
      assert.equal(rows.find((row) => row.target === "generated.md")?.summary, "You are running inside a sandbox on macOS: one policy plus another.");
      assert.equal(rows.find((row) => row.target === "purpose.md")?.summary, "What this holds, wrapped at the prose width.");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe("generated regions", () => {
  test("replaces only the region body", () => {
    const updated = replaceRegion(TABLE, "index-table", "REPLACED");
    assert.equal(readRegion(updated, "index-table"), "REPLACED");
    assert.match(updated, /^## Index/);
  });

  test("leaves a document without the region untouched", () => {
    const text = "# No regions\n";
    assert.equal(replaceRegion(text, "index-table", "REPLACED"), text);
  });

  test("reports an absent region rather than an empty one", () => {
    assert.equal(readRegion("# Nothing\n", "index-table"), undefined);
  });
});

describe("removeFrontmatterFields", () => {
  test("drops a named field and keeps the rest", () => {
    const source =
      "---\nname: git-flow\noptions:\n  - name: co-authorship\n    prompt: Record the agent?\nagents-md: Read {skill}.\n---\n\n# Title\n";
    const stripped = removeFrontmatterFields(source, SCAFFOLDER_FIELDS);
    assert.doesNotMatch(stripped, /co-authorship/, "the whole option list goes, not just its key");
    assert.match(stripped, /name: git-flow/);
    assert.match(stripped, /agents-md: Read \{skill\}\./);
    assert.match(stripped, /# Title/);
  });

  test("drops a field's continuation lines with it", () => {
    const source = "---\nname: x\noption-prompt: >-\n  A question\n  over two lines.\ndescription: Kept.\n---\n";
    const stripped = removeFrontmatterFields(source, ["option-prompt"]);
    assert.doesNotMatch(stripped, /over two lines/);
    assert.match(stripped, /description: Kept\./);
  });

  test("leaves a document without frontmatter alone", () => {
    assert.equal(removeFrontmatterFields("# Title\n", SCAFFOLDER_FIELDS), "# Title\n");
  });
});
