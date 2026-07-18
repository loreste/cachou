/**
 * Consumer-facing package surface: subpath exports resolve and core APIs work
 * without monorepo-only paths (1.0 install readiness).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const require = createRequire(import.meta.url);

/** Resolve a package export the way consumers do via package.json exports. */
function resolveExport(subpath) {
  const key = subpath === "." ? "." : `./${subpath.replace(/^\.\//, "")}`;
  const target = pkg.exports[key];
  assert.ok(target, `missing export ${key}`);
  const rel = typeof target === "string" ? target : target.import;
  assert.ok(rel, `export ${key} has no import`);
  const abs = resolve(root, rel);
  assert.ok(existsSync(abs), `export ${key} file missing: ${rel}`);
  return abs;
}

const REQUIRED_EXPORTS = [
  ".",
  "browser",
  "html",
  "reactivity",
  "router",
  "forms",
  "flow",
  "ssr-adapters",
  "static",
  "vite",
  "styles",
  "content",
  "image"
];

test("required consumer exports resolve to real files", () => {
  for (const name of REQUIRED_EXPORTS) {
    resolveExport(name === "." ? "." : name);
  }
});

test("main entry exposes stable core + SSR helpers", async () => {
  const mod = await import(pathToFileURL(resolveExport(".")).href);
  for (const name of [
    "signal",
    "html",
    "mount",
    "createResource",
    "Router",
    "renderApplication",
    "htmlDocument",
    "getExportStability",
    "createField",
    "Show",
    "For"
  ]) {
    assert.equal(typeof mod[name], "function", `expected ${name}`);
  }
  assert.equal(mod.getExportStability("signal"), "stable");
  assert.equal(mod.getExportStability("createAuth"), "experimental");
});

test("browser entry is free of content/media and exposes mount", async () => {
  const abs = resolveExport("browser");
  const source = readFileSync(abs, "utf8");
  assert.doesNotMatch(source, /content\.js|media\.js/);
  const mod = await import(pathToFileURL(abs).href);
  assert.equal(typeof mod.mount, "function");
  assert.equal(typeof mod.signal, "function");
  assert.equal(typeof mod.buildSrcSet, "function");
  // content build must not be on browser entry
  assert.equal(mod.buildContent, undefined);
  assert.equal(mod.loadContent, undefined);
});

test("ssr-adapters and static helpers are importable", async () => {
  const adapters = await import(pathToFileURL(resolveExport("ssr-adapters")).href);
  assert.equal(typeof adapters.createFetchHandler, "function");
  assert.equal(typeof adapters.handleFetchRequest, "function");

  const staticMod = await import(pathToFileURL(resolveExport("static")).href);
  assert.equal(typeof staticMod.prerenderRoutes, "function");
  assert.equal(typeof staticMod.routeToFilePath, "function");
  assert.equal(staticMod.routeToFilePath("/about"), "about/index.html");
});

test("vite plugin export loads", async () => {
  const vite = await import(pathToFileURL(resolveExport("vite")).href);
  assert.equal(typeof vite.cachou, "function");
  const plugin = vite.cachou({ dirs: [] });
  assert.equal(plugin.name, "vite-plugin-cachou");
});

test("workspace packages point at scaffold and compiler bins", () => {
  const compiler = JSON.parse(
    readFileSync(resolve(root, "packages/compiler/package.json"), "utf8")
  );
  const create = JSON.parse(
    readFileSync(resolve(root, "packages/create-cachou/package.json"), "utf8")
  );
  assert.equal(compiler.name, "@cachoujs/compiler");
  assert.equal(create.name, "@cachoujs/create");
  assert.ok(existsSync(resolve(root, "packages/compiler/bin/cachou-compiler.js")));
  assert.ok(existsSync(resolve(root, "packages/create-cachou/index.js")));
  // create pins match monorepo major.minor line
  const pin = create.version;
  assert.match(pin, /^\d+\.\d+\.\d+/);
});

test("create-cachou CLI supports --template flag (help text)", () => {
  const src = readFileSync(resolve(root, "packages/create-cachou/index.js"), "utf8");
  assert.match(src, /--template/);
  assert.match(src, /spa|ssr|static/);
});
