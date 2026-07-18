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
 *   5. npm publish is interactive / token-based — never commit tokens
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

run("npm", ["run", "test:unit"]);
run("npm", ["run", "compiler:build"]);
run("npm", ["run", "pack:dry"]);

console.log(`
Ready to publish (manual — never paste tokens into chat or commits):
  npm login   # or granular token in ~/.npmrc (local only)
  npm publish --access public
  npm publish -w @cachoujs/compiler --access public
  npm publish -w @cachoujs/create --access public
  git tag v${pkg.version} && git push origin v${pkg.version}

Optional VSIX:
  npm run ext:package
`);
