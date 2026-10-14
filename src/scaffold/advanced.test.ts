/**
 * The advanced flow: what it offers, and what it produces when declined.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { SkillEntry } from "./catalog.js";
import type { Provider } from "../providers/manifest.js";
import {
  NO_CUSTOMISATION,
  advancedChoicesFor,
  collectAnswers,
  hasAdvancedChoices,
} from "./advanced.js";
import type { AdvancedChoice } from "./advanced.js";

const gitFlow: SkillEntry = {
  name: "git-flow",
  description: "Git workflow.",
  agentsDirective: undefined,
  requiresFolder: undefined,
  options: [{ name: "agent-info", prompt: "Should commits record the agent that wrote them?" }],
};

const plainSkill: SkillEntry = {
  name: "adding-context",
  description: "Adds context.",
  agentsDirective: undefined,
  requiresFolder: undefined,
  options: [],
};

const ponytail = {
  name: "ponytail",
  kind: "tool",
  summary: "Writes less code",
  author: "Someone",
  license: "MIT",
  homepage: "https://example.invalid",
  source: { repo: "a/b", ref: "main", commit: "0".repeat(40), path: "skills/ponytail", license: "LICENSE" },
  extras: [
    { name: "ponytail-review", summary: "Reviews", path: "skills/ponytail-review" },
    { name: "ponytail-audit", summary: "Audits", path: "skills/ponytail-audit" },
  ],
} as Provider;

const humanizer = {
  name: "humanizer",
  kind: "skill",
  summary: "Removes AI prose",
  author: "Someone",
  license: "MIT",
  homepage: "https://example.invalid",
  source: { repo: "a/b", ref: "main", commit: "0".repeat(40), path: ".", license: "LICENSE" },
} as Provider;

describe("advancedChoicesFor", () => {
  test("offers nothing when the selection has nothing to customise", () => {
    const choices = advancedChoicesFor([plainSkill], [humanizer], ["adding-context", "humanizer"]);
    assert.deepEqual(choices, []);
    assert.equal(hasAdvancedChoices(choices), false);
  });

  test("offers a skill's option only when that skill was selected", () => {
    assert.equal(advancedChoicesFor([gitFlow], [], ["adding-context"]).length, 0);

    const [choice] = advancedChoicesFor([gitFlow], [], ["git-flow"]);
    assert.equal(choice?.kind, "toggle");
    assert.equal(choice?.owner, "git-flow");
  });

  test("offers a provider's extras only when that provider was selected", () => {
    assert.equal(advancedChoicesFor([], [ponytail], ["humanizer"]).length, 0);

    const [choice] = advancedChoicesFor([], [ponytail], ["ponytail"]);
    assert.equal(choice?.kind, "pick");
    assert.deepEqual(
      choice?.kind === "pick" ? choice.picks.map((pick) => pick.name) : [],
      ["ponytail-review", "ponytail-audit"],
    );
  });

  test("offers both kinds together, skills before providers", () => {
    const choices = advancedChoicesFor([gitFlow], [ponytail], ["git-flow", "ponytail"]);
    assert.deepEqual(
      choices.map((choice) => choice.kind),
      ["toggle", "pick"],
    );
  });

  test("does not offer a provider that bundles nothing", () => {
    assert.deepEqual(advancedChoicesFor([], [humanizer], ["humanizer"]), []);
  });
});

describe("collectAnswers", () => {
  const toggle = advancedChoicesFor([gitFlow], [], ["git-flow"])[0] as AdvancedChoice;
  const pick = advancedChoicesFor([], [ponytail], ["ponytail"])[0] as AdvancedChoice;

  test("turns an accepted toggle into an option and a declined one into nothing", () => {
    assert.deepEqual(collectAnswers(new Map([[toggle, true]])), { options: ["agent-info"], extras: [] });
    assert.deepEqual(collectAnswers(new Map([[toggle, false]])), { options: [], extras: [] });
  });

  test("keeps the extras that were picked", () => {
    assert.deepEqual(collectAnswers(new Map([[pick, ["ponytail-audit"]]])), {
      options: [],
      extras: ["ponytail-audit"],
    });
  });

  test("ignores a pick the choice never offered", () => {
    assert.deepEqual(collectAnswers(new Map([[pick, ["something-else"]]])).extras, []);
  });

  test("combines answers from both kinds", () => {
    const answers = collectAnswers(
      new Map<AdvancedChoice, readonly string[] | boolean>([
        [toggle, true],
        [pick, ["ponytail-review"]],
      ]),
    );
    assert.deepEqual(answers, { options: ["agent-info"], extras: ["ponytail-review"] });
  });

  test("produces the defaults for an empty flow", () => {
    assert.deepEqual(collectAnswers(new Map()), NO_CUSTOMISATION);
  });
});

describe("a skill offering more than one choice", () => {
  test("asks about each of them, naming the skill that asks", () => {
    const twoChoices: SkillEntry = {
      name: "git-flow",
      description: "Git workflow.",
      agentsDirective: undefined,
      requiresFolder: undefined,
      options: [
        { name: "agent-info", prompt: "Should commits record the agent that wrote them?" },
        { name: "no-gpg-sign", prompt: "Should commits skip GPG signing?" },
      ],
    };
    const choices = advancedChoicesFor([twoChoices], [], ["git-flow"]);
    assert.deepEqual(
      choices.map((choice) => [choice.owner, choice.kind === "toggle" ? choice.name : ""]),
      [
        ["git-flow", "agent-info"],
        ["git-flow", "no-gpg-sign"],
      ],
    );
  });

  test("asks about none of them when the skill was not chosen", () => {
    const twoChoices: SkillEntry = {
      name: "git-flow",
      description: "Git workflow.",
      agentsDirective: undefined,
      requiresFolder: undefined,
      options: [
        { name: "agent-info", prompt: "Record the agent?" },
        { name: "no-gpg-sign", prompt: "Skip signing?" },
      ],
    };
    assert.deepEqual(advancedChoicesFor([twoChoices], [], ["writing-project-docs"]), []);
  });
});
