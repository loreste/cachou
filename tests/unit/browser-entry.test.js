import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cachou } from "../../plugin/vite.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const browserEntry = readFileSync(resolve(root, "src/browser.js"), "utf8");

/** Static import graph from browser.js — relative `./foo.js` only. */
function collectStaticImportGraph(entryRel) {
  const seen = new Set();
  const queue = [entryRel];
  const forbidden = [];
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = resolve(root, rel);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, "utf8");
    // Static Node built-in imports break browser bundles. Dynamic `import("node:…")`
    // after a runtime check is allowed (SSR helpers stay dead-code-free in clients).
    if (/(?:from|import)\s+["']node:/.test(source) || /require\(\s*["']node:/.test(source)) {
      forbidden.push({ file: rel, reason: "static node: import" });
    }
    if (/from\s+["']\.\/content\.js["']/.test(source) || /from\s+["']\.\/media\.js["']/.test(source)) {
      forbidden.push({ file: rel, reason: "content/media import" });
    }
    const re = /from\s+["'](\.\/[^"']+\.js)["']/g;
    let m;
    while ((m = re.exec(source))) {
      const next = resolve(dirname(abs), m[1]);
      const nextRel = next.startsWith(root) ? next.slice(root.length + 1) : next;
      if (!seen.has(nextRel) && nextRel.startsWith("src/")) queue.push(nextRel);
    }
  }
  return { files: seen, forbidden };
}

test("browser entry does not pull server-only modules", () => {
  assert.doesNotMatch(browserEntry, /\.\/content\.js/);
  assert.doesNotMatch(browserEntry, /\.\/media\.js/);
  assert.doesNotMatch(browserEntry, /node:/);
});

test("browser static import graph stays free of content/media and node:", () => {
  const { files, forbidden } = collectStaticImportGraph("src/browser.js");
  assert.ok(files.size > 5, "expected a non-trivial browser graph");
  assert.equal(forbidden.length, 0, `forbidden imports: ${JSON.stringify(forbidden)}`);
  assert.ok(!files.has("src/content.js"));
  assert.ok(!files.has("src/media.js"));
});

test("browser package export points at the browser entry", () => {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  assert.equal(packageJson.exports["./browser"].import, "./src/browser.js");
});

test("Vite plugin can select a browser runtime entry", () => {
  const config = cachou({ runtimeEntry: "/runtime/browser.js" }).config();
  assert.equal(config.resolve.alias.cachoujs, "/runtime/browser.js");
});

test("Vite plugin defaults generated browser imports to the browser entry", () => {
  const config = cachou().config();
  assert.equal(config.resolve.alias.cachoujs, resolve(root, "src/browser.js"));
});
