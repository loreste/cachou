#!/usr/bin/env node
/**
 * Pre-publish verification (does not publish).
 *   node scripts/publish-prep.mjs
 *   npm publish --access public   # when ready, from a clean tree
 *
 * Checklist (manual, small):
 *   1. CHANGELOG.md has a section for this version
 *   2. All three packages share the same version
 *   3. No secrets in the tree (this script runs a lightweight scan)
 *   4. npm run test:unit + compiler:build + pack:dry (below)
 *   5. Linux/Chromium GHA green for HEAD when `gh` is available
 *      (required if CACHOU_REQUIRE_CI=1)
 *   6. npm publish is interactive / token-based — never commit tokens
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", cwd: root });
  if (r.status !== 0) process.exit(r.status || 1);
}

function capture(cmd, args) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    cwd: root
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim()
  };
}

/**
 * Confirm required GHA job "Verify (Linux / Chromium)" succeeded for HEAD.
 * Accepts main-push or tag-push check runs for the same SHA.
 */
function checkLinuxChromiumCi() {
  const requireCi =
    process.env.CACHOU_REQUIRE_CI === "1" || process.env.CACHOU_REQUIRE_CI === "true";
  const ghOk = capture("gh", ["--version"]);
  if (ghOk.status !== 0) {
    const msg =
      "gh CLI not available — skip remote CI check. Set CACHOU_REQUIRE_CI=1 after installing gh to enforce.";
    if (requireCi) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(`warn: ${msg}`);
    return;
  }

  const shaRes = capture("git", ["rev-parse", "HEAD"]);
  if (shaRes.status !== 0 || !/^[0-9a-f]{40}$/i.test(shaRes.stdout)) {
    console.error("Could not resolve git HEAD for CI check");
    if (requireCi) process.exit(1);
    return;
  }
  const sha = shaRes.stdout;

  // Prefer check-runs API (covers tag + branch workflows on the same commit).
  const api = capture("gh", [
    "api",
    `repos/{owner}/{repo}/commits/${sha}/check-runs`,
    "--paginate",
    "--jq",
    '[.check_runs[] | select(.name == "Verify (Linux / Chromium)") | {conclusion, status, html_url}]'
  ]);

  if (api.status !== 0) {
    const msg = `Could not query GitHub check-runs for ${sha.slice(0, 7)}: ${api.stderr || api.stdout}`;
    if (requireCi) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(`warn: ${msg}`);
    return;
  }

  let runs = [];
  try {
    runs = JSON.parse(api.stdout || "[]");
  } catch {
    runs = [];
  }
  if (!Array.isArray(runs)) runs = [];

  const success = runs.find(r => r && r.conclusion === "success" && r.status === "completed");
  if (success) {
    console.log(`CI: Verify (Linux / Chromium) success for ${sha.slice(0, 7)}`);
    if (success.html_url) console.log(`    ${success.html_url}`);
    return;
  }

  const pending = runs.find(r => r && (r.status === "queued" || r.status === "in_progress"));
  const msg = pending
    ? `CI: Verify (Linux / Chromium) still ${pending.status} for ${sha.slice(0, 7)} — wait before publish`
    : `CI: no successful Verify (Linux / Chromium) check-run for ${sha.slice(0, 7)} (found ${runs.length} run(s))`;

  if (requireCi) {
    console.error(msg);
    console.error("Re-run: gh run list --commit " + sha.slice(0, 7));
    console.error("Or wait for the tag/main workflow, then re-run publish:prep with CACHOU_REQUIRE_CI=1");
    process.exit(1);
  }
  console.warn(`warn: ${msg}`);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const compilerPkg = JSON.parse(readFileSync(join(root, "packages/compiler/package.json"), "utf8"));
const createPkg = JSON.parse(readFileSync(join(root, "packages/create-cachou/package.json"), "utf8"));
console.log(`Preparing ${pkg.name}@${pkg.version}`);

const major = Number(String(pkg.version).split(".")[0]);
if (Number.isFinite(major) && major >= 1) {
  console.log("1.x+ release — running freeze:check");
  run("node", ["scripts/freeze-check.mjs"]);
} else {
  console.log("0.x prerelease line");
}

if (pkg.version !== compilerPkg.version || pkg.version !== createPkg.version) {
  console.error(
    `Version mismatch: root=${pkg.version} compiler=${compilerPkg.version} create=${createPkg.version}`
  );
  process.exit(1);
}

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## ${pkg.version}`)) {
  console.error(`CHANGELOG.md is missing a "## ${pkg.version}" section. Always add a changelog.`);
  process.exit(1);
}

// Lightweight secret pattern scan (no token values printed)
const SECRET_RE =
  /AKIA[0-9A-Z]{16}|npm_[A-Za-z0-9]{36}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "bin",
  "tmp",
  "artifacts",
  "crm"
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs|ts|json|md|yml|yaml|env|txt)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const secretHits = [];
for (const file of walk(root)) {
  // Skip lockfiles and large generated maps
  if (file.endsWith("package-lock.json") || file.endsWith(".map")) continue;
  let content;
  try {
    const st = statSync(file);
    if (st.size > 1_500_000) continue;
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (SECRET_RE.test(content)) {
    secretHits.push(relative(root, file));
  }
}
if (secretHits.length) {
  console.error("Possible secret material detected (refusing publish-prep):");
  for (const hit of secretHits) console.error(`  - ${hit}`);
  process.exit(1);
}
console.log("Secret scan: clean");

checkLinuxChromiumCi();

run("npm", ["run", "test:unit"]);
run("npm", ["run", "compiler:build"]);
run("npm", ["run", "pack:dry"]);

console.log(`
Ready to publish (manual — never paste tokens into chat or commits):
  # Prefer: push + wait for Linux/Chromium green, then:
  CACHOU_REQUIRE_CI=1 npm run publish:prep
  npm login   # or granular token in ~/.npmrc (local only)
  npm publish --access public
  npm publish -w @cachoujs/compiler --access public
  npm publish -w @cachoujs/create --access public
  git tag v${pkg.version} && git push origin v${pkg.version}

Optional VSIX:
  npm run ext:package
`);
