import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function runIsolated(source) {
  return spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source],
    { cwd: root, encoding: "utf8" }
  );
}

describe("deprecated APIs warn once", () => {
  it("addMiddleware warns at most once per process", () => {
    const r = runIsolated(`
      import { addMiddleware } from "./src/router.js";
      const warnings = [];
      console.warn = msg => warnings.push(String(msg));
      addMiddleware((to, from, next) => next());
      addMiddleware((to, from, next) => next());
      const hits = warnings.filter(w => w.includes("addMiddleware"));
      if (hits.length !== 1) {
        console.error("FAIL hits=" + hits.length);
        process.exit(1);
      }
    `);
    assert.equal(r.status, 0, r.stderr + r.stdout);
  });

  it("createApp warns at most once per process", () => {
    const r = runIsolated(`
      import { createApp } from "./src/plugin.js";
      const warnings = [];
      console.warn = msg => warnings.push(String(msg));
      createApp(() => null);
      createApp(() => null);
      const hits = warnings.filter(w => w.includes("createApp"));
      if (hits.length !== 1) {
        console.error("FAIL hits=" + hits.length);
        process.exit(1);
      }
    `);
    assert.equal(r.status, 0, r.stderr + r.stdout);
  });

  it("useApp warns at most once per process", () => {
    const r = runIsolated(`
      import { useApp } from "./src/plugin.js";
      const warnings = [];
      console.warn = msg => warnings.push(String(msg));
      useApp();
      useApp();
      const hits = warnings.filter(w => w.includes("useApp"));
      if (hits.length !== 1) {
        console.error("FAIL hits=" + hits.length);
        process.exit(1);
      }
    `);
    assert.equal(r.status, 0, r.stderr + r.stdout);
  });
});
