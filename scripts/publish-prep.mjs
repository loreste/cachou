#!/usr/bin/env node
/**
 * Pre-publish verification (does not publish).
 *   node scripts/publish-prep.mjs
 *   npm publish --access public   # when ready, from a clean tree
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status || 1);
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
console.log(`Preparing ${pkg.name}@${pkg.version}`);

if (!String(pkg.version).startsWith("0.")) {
  console.warn("Warning: expected 0.x until 1.0 API freeze.");
}

run("npm", ["run", "test:unit"]);
run("npm", ["run", "compiler:build"]);
run("npm", ["run", "pack:dry"]);

console.log(`
Ready to publish (manual):
  npm login
  npm publish --access public

Optional VSIX:
  npm run ext:package
`);
