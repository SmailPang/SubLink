import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(root, "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function run(command) {
  try {
    return execSync(command, {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function localBuildId() {
  return randomBytes(4).toString("hex").slice(0, 7);
}

const rootPackage = readJson(resolve(workspaceRoot, "package.json"));
const frontendPackage = readJson(resolve(root, "package.json"));
const version = process.env.APP_VERSION || rootPackage.version || frontendPackage.version || "0.0.0";
const branch = process.env.APP_BRANCH || process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || run("git rev-parse --abbrev-ref HEAD") || "local";
const commitSource = process.env.APP_BUILD_ID || process.env.APP_COMMIT || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || run("git rev-parse --short HEAD") || localBuildId();
const commit = commitSource.slice(0, 7);
const builtAt = new Date().toISOString();

const output = resolve(root, "src", "generated", "build-info.ts");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `export const buildInfo = ${JSON.stringify({ version, branch, commit, builtAt }, null, 2)} as const;\n`);

console.log(`build info: ${version}-${commit}`);
