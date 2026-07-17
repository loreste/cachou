import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cachou } from "../../plugin/vite.js";

const root = resolve(new URL("../..", import.meta.url).pathname);
const browserEntry = readFileSync(resolve(root, "src/browser.js"), "utf8");

test("browser entry does not pull server-only modules", () => {
  assert.doesNotMatch(browserEntry, /\.\/content\.js/);
  assert.doesNotMatch(browserEntry, /\.\/media\.js/);
  assert.doesNotMatch(browserEntry, /node:/);
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
