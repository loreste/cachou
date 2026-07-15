#!/usr/bin/env node
/**
 * Cross-compile native Go binaries for common platforms (optional).
 * Output: bin/dist/cachou-compiler-<os>-<arch>[.exe]
 *
 *   node scripts/build-multiarch-compiler.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "bin", "dist");
mkdirSync(outDir, { recursive: true });

const targets = [
  { goos: "darwin", goarch: "arm64" },
  { goos: "darwin", goarch: "amd64" },
  { goos: "linux", goarch: "amd64" },
  { goos: "linux", goarch: "arm64" },
  { goos: "windows", goarch: "amd64" }
];

const go = spawnSync("go", ["version"], { encoding: "utf8" });
if (go.status !== 0) {
  console.error("Go is required for multi-arch native builds. JS compiler remains available.");
  process.exit(0);
}

let failed = 0;
for (const t of targets) {
  const ext = t.goos === "windows" ? ".exe" : "";
  const out = join(outDir, `cachou-compiler-${t.goos}-${t.goarch}${ext}`);
  console.log(`Building ${out}…`);
  const r = spawnSync("go", ["build", "-o", out, "compiler.go"], {
    cwd: root,
    env: { ...process.env, GOOS: t.goos, GOARCH: t.goarch, CGO_ENABLED: "0" },
    stdio: "inherit"
  });
  if (r.status !== 0) {
    failed++;
    console.error(`Failed ${t.goos}/${t.goarch}`);
  } else if (existsSync(out)) {
    console.log(`  ok ${out}`);
  }
}

console.log(failed ? `Done with ${failed} failure(s)` : `All ${targets.length} targets built in bin/dist/`);
process.exit(failed ? 1 : 0);
