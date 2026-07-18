import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("freeze-check script exits 0", () => {
  const r = spawnSync(process.execPath, ["scripts/freeze-check.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Freeze check passed/);
});

test("ONE_POINT_OH.md exists and mentions stable core", () => {
  const text = readFileSync(resolve(root, "docs/ONE_POINT_OH.md"), "utf8");
  assert.match(text, /stable/i);
  assert.match(text, /major/i);
});
