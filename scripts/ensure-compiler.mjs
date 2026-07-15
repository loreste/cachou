#!/usr/bin/env node
/**
 * Build the native compiler when Go is available.
 * Does not fail the install if Go is missing — `go run` remains a fallback.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "bin", "cachou-compiler");

if (process.env.CACHOU_SKIP_COMPILER_BUILD === "1") {
  console.log("⚡ Skipping compiler build (CACHOU_SKIP_COMPILER_BUILD=1)");
  process.exit(0);
}

mkdirSync(join(root, "bin"), { recursive: true });

const go = spawnSync("go", ["version"], { encoding: "utf8" });
if (go.status !== 0) {
  console.log("⚡ Go not found. Compiler will use `go run` when Go is installed, or a prebuilt binary if present.");
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
  console.warn("⚡ Compiler build failed; falling back to `go run compiler.go` when compiling.");
}
