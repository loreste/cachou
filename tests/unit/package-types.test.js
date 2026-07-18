/**
 * Guard: package.json `exports` types conditions point at real .d.ts files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

test("main and browser exports declare types", () => {
  assert.equal(pkg.exports["."].types, "./src/index.d.ts");
  assert.equal(pkg.exports["./browser"].types, "./src/index.d.ts");
  assert.ok(existsSync(resolve(root, "src/index.d.ts")));
});

test("subpath exports with a sibling .d.ts include a types condition", () => {
  const missing = [];
  const broken = [];
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    if (subpath === "./package.json" || subpath === "./vite") continue;
    if (typeof target === "string") {
      const dts = target.replace(/\.js$/, ".d.ts");
      if (existsSync(resolve(root, dts))) {
        missing.push({ subpath, note: "has .d.ts but export is string-only" });
      }
      continue;
    }
    if (target && typeof target === "object" && target.types) {
      const abs = resolve(root, target.types);
      if (!existsSync(abs)) broken.push({ subpath, types: target.types });
    }
  }
  assert.deepEqual(missing, [], `string-only exports that should wire types: ${JSON.stringify(missing)}`);
  assert.deepEqual(broken, [], `broken types paths: ${JSON.stringify(broken)}`);
});

test("core deep-import modules ship dedicated .d.ts", () => {
  for (const name of [
    "html",
    "reactivity",
    "router",
    "forms",
    "flow",
    "a11y",
    "file-routes",
    "plugin",
    "content",
    "image",
    "files",
    "devtools",
    "ssr-adapters"
  ]) {
    assert.ok(
      existsSync(resolve(root, `src/${name}.d.ts`)),
      `expected src/${name}.d.ts`
    );
    const exp = pkg.exports[`./${name}`];
    assert.ok(exp && exp.types, `exports["./${name}"] must have types`);
  }
});

test("index.d.ts exports core generic helpers", () => {
  const dts = readFileSync(resolve(root, "src/index.d.ts"), "utf8");
  for (const token of [
    "export type Accessor",
    "export type MaybeAccessor",
    "export type CachouChild",
    "export type Component",
    "export type MiddlewareHandler",
    "export function Show<",
    "export function For<",
    "export function Index<"
  ]) {
    assert.ok(dts.includes(token), `index.d.ts should include ${token}`);
  }
});
