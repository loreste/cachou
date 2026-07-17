#!/usr/bin/env node
/**
 * Cross-compile optional native Go launchers for common platforms.
 *
 * The pure JS compiler (`@cachoujs/compiler`) is canonical for consumers.
 * These binaries only wrap the same JS compiler (see compiler.go) and are
 * useful for monorepo / CI environments that want a single native entrypoint.
 *
 * Output (never published on npm by default):
 *   bin/dist/cachou-compiler-<os>-<arch>[.exe]
 *   bin/dist/manifest.json
 *   bin/dist/README.md
 *
 *   node scripts/build-multiarch-compiler.mjs
 *   npm run compiler:package-binaries   # optional tarballs for GitHub release assets
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, statSync, readFileSync } from "node:fs";
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
  console.error("Go is required for multi-arch native builds. The pure JS compiler remains available via @cachoujs/compiler.");
  process.exit(0);
}

const built = [];
let failed = 0;
for (const t of targets) {
  const ext = t.goos === "windows" ? ".exe" : "";
  const fileName = `cachou-compiler-${t.goos}-${t.goarch}${ext}`;
  const out = join(outDir, fileName);
  console.log(`Building ${out}…`);
  const r = spawnSync("go", ["build", "-o", out, "compiler.go"], {
    cwd: root,
    env: { ...process.env, GOOS: t.goos, GOARCH: t.goarch, CGO_ENABLED: "0" },
    stdio: "inherit"
  });
  if (r.status !== 0) {
    failed++;
    console.error(`Failed ${t.goos}/${t.goarch}`);
    continue;
  }
  if (existsSync(out)) {
    const size = statSync(out).size;
    built.push({
      file: fileName,
      goos: t.goos,
      goarch: t.goarch,
      size,
      note: "Optional native launcher; delegates to packages/compiler (pure JS)."
    });
    console.log(`  ok ${out} (${size} bytes)`);
  }
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const manifest = {
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  canonicalCompiler: "@cachoujs/compiler (packages/compiler — pure JavaScript)",
  consumerDefault: "Use npx @cachoujs/compiler / npx cachou-compiler (JS). Native multi-arch binaries are optional monorepo/CI launchers and are not required for app installs.",
  preferNativeEnv: "CACHOU_COMPILER_NATIVE=1",
  targets: built
};

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

const readme = `# Optional multi-arch compiler launchers

These binaries are **optional**. The supported consumer path is pure JavaScript:

\`\`\`bash
npm install -D @cachoujs/compiler
npx cachou-compiler -dir src/components -out src/components
\`\`\`

## What these files are

Each \`cachou-compiler-<os>-<arch>\` binary is a thin Go entrypoint that runs the
**same** JS compiler under \`packages/compiler\`. They do not replace or accelerate
template compilation beyond a native process wrapper.

| Consumer need | Use |
|---------------|-----|
| App / library install from npm | \`@cachoujs/compiler\` (JS) only |
| Monorepo CI with a single native \`PATH\` entry | build here, then set \`CACHOU_COMPILER_NATIVE=1\` |
| Publish release assets (optional) | \`npm run compiler:package-binaries\` |

## Build

\`\`\`bash
npm run compiler:build:multiarch
# → bin/dist/* + manifest.json
\`\`\`

## Package as GitHub release assets (not npm)

\`\`\`bash
npm run compiler:package-binaries
# → tmp/compiler-binaries/*.tgz + checksums.txt
\`\`\`

Do **not** add \`bin/dist\` to the published \`cachoujs\` / \`@cachoujs/compiler\` npm
\`files\` lists — multi-megabyte platform binaries do not belong on every install.

Version: ${packageJson.version}
Generated: ${manifest.generatedAt}
`;

writeFileSync(join(outDir, "README.md"), readme, "utf8");

console.log(
  failed
    ? `Done with ${failed} failure(s); wrote bin/dist/manifest.json`
    : `All ${targets.length} targets built in bin/dist/ (manifest + README written)`
);
process.exit(failed ? 1 : 0);
