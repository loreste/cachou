/**
 * Zip the Chromium DevTools extension for load-unpacked / distribution.
 * Does not publish to the Chrome Web Store.
 */
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "extensions", "browser-devtools");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const version = manifest.version || "0.0.0";
const out = join(dir, `cachou-devtools-${version}.zip`);

const required = [
  "manifest.json",
  "background.js",
  "content.js",
  "page-bridge.js",
  "popup.html",
  "popup.js"
];
for (const file of required) {
  if (!existsSync(join(dir, file))) {
    console.error(`Missing ${file} in browser-devtools`);
    process.exit(1);
  }
}

// Prefer system zip for portable archives without extra deps.
const result = spawnSync(
  "zip",
  ["-r", "-q", out, ".", "-x", "*.zip", "-x", ".DS_Store", "-x", "**/.*"],
  { cwd: dir, encoding: "utf8" }
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "zip failed");
  console.error("Install `zip` or package the folder manually.");
  process.exit(result.status || 1);
}

console.log(`Wrote ${out}`);
