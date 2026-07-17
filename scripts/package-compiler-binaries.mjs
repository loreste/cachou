#!/usr/bin/env node
/**
 * Package optional multi-arch native launchers as tarballs for GitHub release
 * assets. Does not publish to npm.
 *
 * Prerequisite: npm run compiler:build:multiarch
 *
 *   node scripts/package-compiler-binaries.mjs
 *   → tmp/compiler-binaries/cachou-compiler-<os>-<arch>-vX.Y.Z.tgz
 *   → tmp/compiler-binaries/checksums.txt
 *   → tmp/compiler-binaries/manifest.json
 */
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "bin", "dist");
const outDir = join(root, "tmp", "compiler-binaries");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

if (!existsSync(distDir)) {
  console.error("bin/dist missing. Run: npm run compiler:build:multiarch");
  process.exit(1);
}

const binaries = readdirSync(distDir).filter(
  name => name.startsWith("cachou-compiler-") && !name.endsWith(".json") && !name.endsWith(".md")
);

if (binaries.length === 0) {
  console.error("No binaries in bin/dist. Run: npm run compiler:build:multiarch");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

const packages = [];
const checksumLines = [];

for (const file of binaries.sort()) {
  const src = join(distDir, file);
  const base = file.replace(/\.exe$/, "");
  const tarballName = `${base}-v${version}.tgz`;
  const stage = join(outDir, `.stage-${base}`);
  mkdirSync(stage, { recursive: true });
  copyFileSync(src, join(stage, file));
  writeFileSync(
    join(stage, "README.md"),
    `# ${file}

Optional CachouJS native compiler **launcher** for version **${version}**.

This binary delegates to the pure JavaScript compiler. Preferred install:

\`\`\`bash
npm install -D @cachoujs/compiler@${version}
npx cachou-compiler -dir src/components -out src/components
\`\`\`

To use this launcher locally, place it on your \`PATH\` as \`cachou-compiler\` and set:

\`\`\`bash
export CACHOU_COMPILER_NATIVE=1
\`\`\`
`,
    "utf8"
  );

  const tarballPath = join(outDir, tarballName);
  // Prefer tar CLI for portable ustar archives
  const tar = spawnSync(
    "tar",
    ["-czf", tarballPath, "-C", stage, "."],
    { encoding: "utf8" }
  );
  rmSync(stage, { recursive: true, force: true });
  if (tar.status !== 0) {
    console.error(`Failed to package ${file}: ${tar.stderr || tar.stdout || "tar error"}`);
    process.exit(1);
  }

  const digest = await sha256File(tarballPath);
  checksumLines.push(`${digest}  ${tarballName}`);
  packages.push({ file: tarballName, binary: file, sha256: digest });
  console.log(`packed ${tarballName}`);
}

// Always write a release manifest pinned to package.json version (do not ship a
// stale bin/dist/manifest.json if multiarch was built before the version bump).
let distManifest = null;
if (existsSync(join(distDir, "manifest.json"))) {
  try {
    distManifest = JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf8"));
  } catch {
    distManifest = null;
  }
}
const releaseManifest = {
  version,
  generatedAt: new Date().toISOString(),
  canonicalCompiler: distManifest?.canonicalCompiler || "@cachoujs/compiler (packages/compiler — pure JavaScript)",
  consumerDefault:
    distManifest?.consumerDefault ||
    "Use npx @cachoujs/compiler / npx cachou-compiler (JS). Native multi-arch binaries are optional monorepo/CI launchers and are not required for app installs.",
  preferNativeEnv: distManifest?.preferNativeEnv || "CACHOU_COMPILER_NATIVE=1",
  packages,
  targets: distManifest?.targets || packages.map(p => ({ file: p.binary }))
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(releaseManifest, null, 2) + "\n", "utf8");

writeFileSync(join(outDir, "checksums.txt"), checksumLines.join("\n") + "\n", "utf8");
writeFileSync(
  join(outDir, "PACKAGING.md"),
  `# Compiler binary packaging

Version: ${version}
Packages: ${packages.length}

These tarballs are for **optional GitHub release assets**, not npm.

\`\`\`bash
# Maintainers (order matters: bump version → multiarch → package → upload)
npm run compiler:build:multiarch
npm run compiler:package-binaries
gh release upload v${version} tmp/compiler-binaries/*.tgz tmp/compiler-binaries/checksums.txt tmp/compiler-binaries/manifest.json
\`\`\`

Consumers should still prefer \`@cachoujs/compiler\` from npm.
`,
  "utf8"
);

console.log(`Wrote ${packages.length} package(s) to ${outDir}`);
console.log(`checksums: ${join(outDir, "checksums.txt")}`);
