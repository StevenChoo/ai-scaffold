/**
 * Resolution of guarded prose, which decides what a declined folder leaves behind.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { applyRequirements, conditionsFor, presenceOf } from "./requirements.js";

const always = (): boolean => true;
const never = (): boolean => false;

describe("presenceOf", () => {
  test("recognises a written file and every directory above it", () => {
    const present = presenceOf(["skills/git-flow/SKILL.md"]);
    assert.equal(present("skills/git-flow/SKILL.md"), true);
    assert.equal(present("skills/git-flow"), true);
    assert.equal(present("skills"), true);
  });

  test("does not recognise a path that was not written", () => {
    const present = presenceOf(["context/project.md"]);
    assert.equal(present("templates/_index.template.md"), false);
    assert.equal(present("skills"), false);
  });

  test("ignores surrounding slashes so a folder may be named either way", () => {
    assert.equal(presenceOf(["templates/x.md"])("/templates/"), true);
  });
});

describe("applyRequirements", () => {
  test("keeps a guarded list item and removes only the guard", () => {
    const source = "- One.\n<!-- agent-generated:requires templates/x.md -->\n- Two.\n- Three.\n";
    assert.equal(applyRequirements(source, always), "- One.\n- Two.\n- Three.\n");
  });

  test("drops a guarded list item when its dependency is absent", () => {
    const source = "- One.\n<!-- agent-generated:requires templates/x.md -->\n- Two.\n- Three.\n";
    assert.equal(applyRequirements(source, never), "- One.\n- Three.\n");
  });

  test("drops a guarded paragraph and its trailing blank line", () => {
    const source = "Before.\n\n<!-- agent-generated:requires templates/x.md -->\nGuarded line one.\nGuarded line two.\n\nAfter.\n";
    assert.equal(applyRequirements(source, never), "Before.\n\nAfter.\n");
  });

  test("keeps a guarded paragraph whole when its dependency is present", () => {
    const source = "Before.\n\n<!-- agent-generated:requires templates/x.md -->\nGuarded line one.\nGuarded line two.\n\nAfter.\n";
    assert.equal(applyRequirements(source, always), "Before.\n\nGuarded line one.\nGuarded line two.\n\nAfter.\n");
  });

  test("keeps a guarded list item's indented continuation lines", () => {
    const source = "<!-- agent-generated:requires a/b.md -->\n- Item\n  continued here.\n- Next.\n";
    assert.equal(applyRequirements(source, never), "- Next.\n");
    assert.equal(applyRequirements(source, always), "- Item\n  continued here.\n- Next.\n");
  });

  test("resolves each guard against its own dependency", () => {
    const source =
      "<!-- agent-generated:requires kept/x.md -->\n- Kept.\n<!-- agent-generated:requires gone/y.md -->\n- Gone.\n";
    assert.equal(applyRequirements(source, (path) => path.startsWith("kept")), "- Kept.\n");
  });

  test("resolves an option condition from the chosen options", () => {
    const source = "<!-- agent-generated:requires option:co-authorship -->\nRecord the agent.\n";
    assert.equal(applyRequirements(source, conditionsFor([], ["co-authorship"])), "Record the agent.\n");
    assert.equal(applyRequirements(source, conditionsFor([], [])), "");
  });

  test("keeps exactly one side of a negated pair", () => {
    const source =
      "<!-- agent-generated:requires option:x -->\nYes side.\n\n<!-- agent-generated:requires !option:x -->\nNo side.\n";
    assert.equal(applyRequirements(source, conditionsFor([], ["x"])), "Yes side.\n");
    assert.equal(applyRequirements(source, conditionsFor([], [])), "No side.\n");
  });

  test("negates a path condition too", () => {
    const source = "<!-- agent-generated:requires !templates/x.md -->\n- Only without templates.\n";
    assert.equal(applyRequirements(source, conditionsFor(["templates/x.md"])), "");
    assert.equal(applyRequirements(source, conditionsFor([])), "- Only without templates.\n");
  });

  test("an option is off unless it was chosen", () => {
    const holds = conditionsFor([], ["on"]);
    assert.equal(holds("option:on"), true);
    assert.equal(holds("option:off"), false);
  });

  test("leaves a document without guards unchanged", () => {
    const source = "# Title\n\nA paragraph.\n\n- A list item.\n";
    assert.equal(applyRequirements(source, never), source);
  });

  test("never leaves a guard comment behind", () => {
    const source = "<!-- agent-generated:requires a/b.md -->\n- Item.\n";
    for (const present of [always, never]) {
      assert.doesNotMatch(applyRequirements(source, present), /agent-generated:requires/);
    }
  });
});
