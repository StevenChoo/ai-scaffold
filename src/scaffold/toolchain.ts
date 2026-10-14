/**
 * What a repository's own files say about how it is built.
 *
 * An agent that guesses the package manager or invents a build command wastes a turn at best
 * and runs the wrong thing at worst. Most of that is written down already — in a lockfile, in
 * `engines`, in `scripts` — so the environment context file states it from evidence instead of
 * asking a developer to type it.
 *
 * Only what a file at the repository root proves is reported. A monorepo's packages, a CI
 * workflow's checks and anything installed on a machine are deliberately out of reach: the
 * first two are guesses from here, and the third is a local fact that does not belong in a
 * committed file.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { renderTable } from "./table.js";

/** One detected tool: what it is, the file that proves it, and how it is invoked. */
export interface DetectedTool {
  readonly tool: string;
  readonly evidence: string;
  readonly use: string;
}

/** Everything detected at a repository root. */
export interface Toolchain {
  readonly tools: readonly DetectedTool[];
  /** Package scripts, as the command that runs each. Empty when there is no package manifest. */
  readonly scripts: readonly { readonly name: string; readonly command: string }[];
}

interface PackageManifest {
  readonly packageManager?: unknown;
  readonly engines?: unknown;
  readonly scripts?: unknown;
}

/** Lockfiles in the order that settles a repository carrying more than one. */
const NODE_LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
] as const;

async function readManifest(root: string): Promise<PackageManifest | undefined> {
  const path = join(root, "package.json");
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as PackageManifest) : undefined;
  } catch {
    // A manifest that does not parse proves nothing; the developer will hear about it from npm.
    return undefined;
  }
}

/**
 * npm lifecycle scripts, which the package manager runs itself around install, pack and
 * publish. Listing them as commands would invite an agent to run a publish step by hand.
 */
const LIFECYCLE_SCRIPTS = new Set(["install", "preinstall", "postinstall", "prepare", "prepack", "postpack", "prepublish", "prepublishOnly", "postpublish"]);

/** Whether a script is a hook around another script or a lifecycle event, rather than a command. */
function isHook(name: string, all: ReadonlySet<string>): boolean {
  if (LIFECYCLE_SCRIPTS.has(name)) {
    return true;
  }
  const hooked = /^(?:pre|post)(.+)$/.exec(name)?.[1];
  return hooked !== undefined && all.has(hooked);
}

/** The command that runs a package script under a given package manager. */
function scriptCommand(manager: string, script: string): string {
  return manager === "npm" ? `npm run ${script}` : `${manager} ${script}`;
}

async function detectNode(root: string, tools: DetectedTool[]): Promise<Toolchain["scripts"]> {
  const manifest = await readManifest(root);
  if (!manifest) {
    return [];
  }

  // `packageManager` pins a version; a lockfile only names the tool. Prefer the stronger proof.
  let manager: string | undefined;
  const pinned = typeof manifest.packageManager === "string" ? /^([a-z]+)@(\S+)/.exec(manifest.packageManager) : null;
  if (pinned?.[1] && pinned[2]) {
    manager = pinned[1];
    tools.push({ tool: `${manager} ${pinned[2]}`, evidence: "`packageManager` in `package.json`", use: `\`${manager} install\`` });
  } else {
    const lockfile = NODE_LOCKFILES.find(([file]) => existsSync(join(root, file)));
    if (lockfile) {
      manager = lockfile[1];
      tools.push({ tool: manager, evidence: `\`${lockfile[0]}\``, use: `\`${manager} install\`` });
    }
  }

  const engines = manifest.engines;
  if (typeof engines === "object" && engines !== null) {
    for (const [runtime, range] of Object.entries(engines as Record<string, unknown>)) {
      if (typeof range === "string" && runtime !== manager) {
        tools.push({ tool: `${runtime === "node" ? "Node" : runtime} ${range}`, evidence: "`engines` in `package.json`", use: "—" });
      }
    }
  }

  if (!manager || typeof manifest.scripts !== "object" || manifest.scripts === null) {
    return [];
  }
  const names = new Set(Object.keys(manifest.scripts));
  return [...names]
    .filter((name) => !isHook(name, names))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, command: scriptCommand(manager, name) }));
}

async function detectOthers(root: string, tools: DetectedTool[]): Promise<void> {
  const has = (file: string): boolean => existsSync(join(root, file));

  // A wrapper script is the project's statement that the system binary is not to be trusted.
  if (has("gradlew")) {
    tools.push({ tool: "Gradle wrapper", evidence: "`gradlew`", use: "`./gradlew <task>`, never `gradle`" });
  } else if (has("build.gradle") || has("build.gradle.kts")) {
    tools.push({ tool: "Gradle", evidence: has("build.gradle.kts") ? "`build.gradle.kts`" : "`build.gradle`", use: "`gradle <task>`" });
  }

  if (has("mvnw")) {
    tools.push({ tool: "Maven wrapper", evidence: "`mvnw`", use: "`./mvnw <goal>`, never `mvn`" });
  } else if (has("pom.xml")) {
    tools.push({ tool: "Maven", evidence: "`pom.xml`", use: "`mvn <goal>`" });
  }

  if (has("uv.lock")) {
    tools.push({ tool: "uv", evidence: "`uv.lock`", use: "`uv sync`, `uv run <command>`" });
  } else if (has("poetry.lock")) {
    tools.push({ tool: "Poetry", evidence: "`poetry.lock`", use: "`poetry install`, `poetry run <command>`" });
  }

  if (has("Cargo.toml")) {
    tools.push({ tool: "Cargo", evidence: "`Cargo.toml`", use: "`cargo build`, `cargo test`" });
  }

  if (has("go.mod")) {
    const directive = /^go\s+(\S+)/m.exec(await readFile(join(root, "go.mod"), "utf8"));
    tools.push({ tool: directive?.[1] ? `Go ${directive[1]}` : "Go", evidence: "`go.mod`", use: "`go build ./...`, `go test ./...`" });
  }
}

/** Reads what the repository root proves about its toolchain. */
export async function detectToolchain(root: string): Promise<Toolchain> {
  const tools: DetectedTool[] = [];
  const scripts = await detectNode(root, tools);
  await detectOthers(root, tools);
  return { tools, scripts };
}

/** Renders a detected toolchain as the body of the generated region. */
export function renderToolchain(toolchain: Toolchain): string {
  if (toolchain.tools.length === 0) {
    return "Nothing at the repository root identifies a toolchain. State the build and test commands in the constraints below, or in `commands/`.";
  }

  const parts = [
    renderTable(
      ["Tool", "Detected from", "Use"],
      toolchain.tools.map((tool) => [tool.tool, tool.evidence, tool.use]),
    ),
  ];
  if (toolchain.scripts.length > 0) {
    parts.push(
      renderTable(
        ["Script", "Run with"],
        toolchain.scripts.map((script) => [`\`${script.name}\``, `\`${script.command}\``]),
      ),
    );
  }
  return parts.join("\n\n");
}
