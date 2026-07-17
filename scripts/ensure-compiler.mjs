#!/usr/bin/env node
/**
 * Keep installs fast: the JavaScript compiler is canonical and needs no native build.
 * Set CACHOU_COMPILER_LEGACY=1 only when investigating the legacy Go implementation.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "bin", "cachou-compiler");

if (process.env.CACHOU_SKIP_COMPILER_BUILD === "1" || process.env.CACHOU_COMPILER_LEGACY !== "1") {
  if (process.env.CACHOU_COMPILER_LEGACY !== "1") {
    console.log("⚡ Using the canonical JavaScript compiler; skipping the optional Go build.");
  } else {
    console.log("⚡ Skipping compiler build (CACHOU_SKIP_COMPILER_BUILD=1)");
  }
  process.exit(0);
}

mkdirSync(join(root, "bin"), { recursive: true });

const go = spawnSync("go", ["version"], { encoding: "utf8" });
if (go.status !== 0) {
  console.log("⚡ Go not found. The canonical JavaScript compiler remains available.");
  process.exit(0);
}

const result = spawnSync("go", ["build", "-o", out, "compiler.go"], {
  cwd: root,
  encoding: "utf8",
  stdio: "inherit"
});

if (result.status === 0 && existsSync(out)) {
  console.log(`⚡ Built compiler: ${out}`);
} else {
  console.warn("⚡ Legacy Go compiler build failed; the canonical JavaScript compiler remains available.");
}
