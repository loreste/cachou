import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("published package surface", () => {
  it("does not ship CRM, demo server, or multi-arch bin/dist on npm", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const files = pkg.files || [];
    const joined = files.join("\n");
    assert.equal(files.includes("src"), true);
    assert.doesNotMatch(joined, /\bcrm\b/);
    assert.doesNotMatch(joined, /\bdemo\b/);
    assert.doesNotMatch(joined, /bin\/dist/);
    assert.doesNotMatch(joined, /server\.js$/m);
  });

  it("compiler package ships pure JS only", () => {
    const pkg = JSON.parse(readFileSync(join(root, "packages/compiler/package.json"), "utf8"));
    const files = pkg.files || [];
    assert.ok(files.includes("lib"));
    assert.ok(files.includes("bin"));
    assert.equal(files.some(f => String(f).includes("dist")), false);
  });

  it("multi-arch packaging helpers exist for optional release assets", () => {
    assert.equal(existsSync(join(root, "scripts/build-multiarch-compiler.mjs")), true);
    assert.equal(existsSync(join(root, "scripts/package-compiler-binaries.mjs")), true);
  });
});
