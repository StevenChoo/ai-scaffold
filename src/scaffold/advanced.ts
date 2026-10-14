/**
 * The questions a developer only sees if they ask for them.
 *
 * Some things installed here have more to decide than yes or no: `git-flow` can be told
 * whether commits record an agent, `ponytail` bundles five skills beyond its core. Asking
 * everyone about all of it would make the common path long for the sake of the rare one.
 *
 * So there is one question — "customise advanced options?" — defaulting to no, and behind it
 * a flow built from whatever the developer actually selected. A run that accepts the defaults
 * is never asked any of this, and a selection with nothing to customise never offers it.
 */

import type { SkillEntry } from "./catalog.js";
import type { Provider } from "../providers/manifest.js";

/** One thing a developer may customise, once they have asked to. */
export type AdvancedChoice =
  | {
      readonly kind: "toggle";
      /** What this belongs to, so a prompt can say which skill is asking. */
      readonly owner: string;
      /** The option name, as guarded prose addresses it: `option:<name>`. */
      readonly name: string;
      readonly prompt: string;
    }
  | {
      readonly kind: "pick";
      readonly owner: string;
      readonly prompt: string;
      readonly picks: readonly { readonly name: string; readonly summary: string }[];
    };

/** What the advanced flow produced, or the defaults when it was declined. */
export interface AdvancedAnswers {
  /** Options switched on. Everything not named stays off. */
  readonly options: readonly string[];
  /** Bundled extras to install. A provider's core skill is never in here. */
  readonly extras: readonly string[];
}

/** No customisation: every toggle off, no extras. The answer for a run that declines. */
export const NO_CUSTOMISATION: AdvancedAnswers = { options: [], extras: [] };

/**
 * Builds the flow from what was selected.
 *
 * A skill that declares no option and a provider that bundles nothing contribute nothing, so
 * the flow is empty for most selections and the question is not worth asking.
 */
export function advancedChoicesFor(
  authoredSkills: readonly SkillEntry[],
  providers: readonly Provider[],
  chosen: readonly string[],
): AdvancedChoice[] {
  const choices: AdvancedChoice[] = [];

  for (const skill of authoredSkills) {
    if (!chosen.includes(skill.name)) {
      continue;
    }
    for (const option of skill.options) {
      choices.push({ kind: "toggle", owner: skill.name, name: option.name, prompt: option.prompt });
    }
  }

  for (const provider of providers) {
    const extras = provider.extras ?? [];
    if (extras.length > 0 && chosen.includes(provider.name)) {
      choices.push({
        kind: "pick",
        owner: provider.name,
        prompt: `Which extra ${provider.name} skills should be installed?`,
        picks: extras.map((extra) => ({ name: extra.name, summary: extra.summary })),
      });
    }
  }

  return choices;
}

/** Whether anything selected has something to customise. */
export function hasAdvancedChoices(choices: readonly AdvancedChoice[]): boolean {
  return choices.length > 0;
}

/** Splits raw answers into the two shapes the scaffold consumes. */
export function collectAnswers(
  answered: ReadonlyMap<AdvancedChoice, readonly string[] | boolean>,
): AdvancedAnswers {
  const options: string[] = [];
  const extras: string[] = [];

  for (const [choice, answer] of answered) {
    if (choice.kind === "toggle") {
      if (answer === true) {
        options.push(choice.name);
      }
      continue;
    }
    if (Array.isArray(answer)) {
      const offered = new Set(choice.picks.map((pick) => pick.name));
      extras.push(...answer.filter((name) => offered.has(name)));
    }
  }

  return { options, extras };
}
