import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const createCli = resolve(root, "packages/create-cachou/index.js");

function runCreate(args, cwd) {
  return spawnSync(process.execPath, [createCli, ...args], {
    cwd,
    encoding: "utf8"
  });
}

describe("create-cachou templates", () => {
  const parent = mkdtempSync(join(tmpdir(), "cachou-create-"));
  after(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  it("prints help", () => {
    const r = runCreate(["--help"], parent);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /--template/);
    assert.match(r.stdout, /spa/);
  });

  it("scaffolds spa with browser entry", () => {
    const r = runCreate(["spa-app", "--template", "spa"], parent);
    assert.equal(r.status, 0, r.stderr);
    const dir = join(parent, "spa-app");
    assert.ok(existsSync(join(dir, "src/main.js")));
    const main = readFileSync(join(dir, "src/main.js"), "utf8");
    assert.match(main, /cachoujs\/browser/);
    assert.match(main, /history: "browser"/);
    assert.equal(existsSync(join(dir, "server.mjs")), false);
  });

  it("scaffolds static with hash history and prerender script", () => {
    const r = runCreate(["static-app", "-t", "static"], parent);
    assert.equal(r.status, 0, r.stderr);
    const dir = join(parent, "static-app");
    const main = readFileSync(join(dir, "src/main.js"), "utf8");
    assert.match(main, /history: "hash"/);
    assert.ok(existsSync(join(dir, "scripts/prerender.mjs")));
    assert.ok(existsSync(join(dir, "public/_redirects")));
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    assert.ok(pkg.scripts.prerender);
  });

  it("scaffolds ssr with server.mjs", () => {
    const r = runCreate(["ssr-app", "--template=ssr"], parent);
    assert.equal(r.status, 0, r.stderr);
    const dir = join(parent, "ssr-app");
    assert.ok(existsSync(join(dir, "server.mjs")));
    const server = readFileSync(join(dir, "server.mjs"), "utf8");
    assert.match(server, /renderApplication/);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    assert.ok(pkg.scripts.ssr);
  });

  it("rejects bad template", () => {
    const r = runCreate(["bad-app", "--template", "nope"], parent);
    assert.notEqual(r.status, 0);
  });
});
