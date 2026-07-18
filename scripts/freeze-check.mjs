#!/usr/bin/env node
/**
 * Verify 1.0 freeze entry criteria (docs + package surface).
 * Does not run the full browser suite — use `npm run check` for that.
 *
 *   npm run freeze:check
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function ok(cond, msg) {
  if (!cond) failures.push(msg);
  else console.log(`  ✓ ${msg}`);
}

function mustExist(rel) {
  const abs = join(root, rel);
  ok(existsSync(abs), `exists ${rel}`);
  return abs;
}

console.log("CachouJS freeze check\n");

// --- Versions ---
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const compiler = JSON.parse(readFileSync(join(root, "packages/compiler/package.json"), "utf8"));
const create = JSON.parse(readFileSync(join(root, "packages/create-cachou/package.json"), "utf8"));
ok(pkg.version === compiler.version && pkg.version === create.version, `aligned package versions (${pkg.version})`);
ok(/^\d+\.\d+\.\d+/.test(pkg.version), `semver version ${pkg.version}`);

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
ok(changelog.includes(`## ${pkg.version}`), `CHANGELOG has ## ${pkg.version}`);

// --- Freeze docs ---
mustExist("docs/STABILITY.md");
mustExist("docs/EXPERIMENTAL.md");
mustExist("docs/DEPRECATIONS.md");
mustExist("docs/SECURITY.md");
mustExist("docs/ONE_POINT_OH.md");

const stability = readFileSync(join(root, "docs/STABILITY.md"), "utf8");
ok(/stable/i.test(stability), "STABILITY.md documents stable label");
const experimental = readFileSync(join(root, "docs/EXPERIMENTAL.md"), "utf8");
ok(/experimental/i.test(experimental), "EXPERIMENTAL.md present");
const deprecations = readFileSync(join(root, "docs/DEPRECATIONS.md"), "utf8");
ok(/addMiddleware|guard/i.test(deprecations), "DEPRECATIONS lists middleware rename");

// --- Runtime stability data ---
const { getExportStability, STABLE_EXPORTS, EXPERIMENTAL_EXPORTS } = await import(
  pathToFileURL(join(root, "src/stability.js")).href
);
ok(STABLE_EXPORTS.length >= 40, `STABLE_EXPORTS count (${STABLE_EXPORTS.length})`);
ok(getExportStability("signal") === "stable", "signal is stable");
ok(getExportStability("html") === "stable", "html is stable");
ok(getExportStability("createResource") === "stable", "createResource is stable");
ok(getExportStability("Router") === "stable", "Router is stable");
ok(getExportStability("renderApplication") === "stable", "renderApplication is stable");
ok(getExportStability("createField") === "stable", "createField is stable");
ok(getExportStability("createAuth") === "experimental", "createAuth is experimental");
ok(EXPERIMENTAL_EXPORTS.includes("createAuth"), "EXPERIMENTAL_EXPORTS includes createAuth");

// --- Consumer exports ---
const required = [".", "./browser", "./ssr-adapters", "./static", "./vite", "./forms", "./router"];
for (const key of required) {
  const exp = pkg.exports[key];
  ok(Boolean(exp), `package exports ${key}`);
  const rel = typeof exp === "string" ? exp : exp?.import;
  if (rel) ok(existsSync(join(root, rel)), `export target ${key} → ${rel}`);
}

// --- Scaffold templates ---
const createSrc = readFileSync(join(root, "packages/create-cachou/index.js"), "utf8");
ok(createSrc.includes("--template"), "create-cachou supports --template");
ok(/spa|ssr|static/.test(createSrc), "create-cachou has spa/ssr/static templates");
ok(createSrc.includes("cachoujs/browser"), "create-cachou uses browser entry");

// --- 1.0 commitment file ---
const one = readFileSync(join(root, "docs/ONE_POINT_OH.md"), "utf8");
ok(/stable core|API commitment|breaking/i.test(one), "ONE_POINT_OH.md describes commitment");

console.log("");
if (failures.length) {
  console.error("Freeze check FAILED:\n");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Freeze check passed for ${pkg.name}@${pkg.version}`);
