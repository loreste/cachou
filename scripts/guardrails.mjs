import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const SKIP = new Set(["node_modules", "dist", ".git", "bin", "artifacts"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(js|mjs|cachou)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(root);
const issues = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const label = relative(root, file);
  const isHarness =
    label.startsWith("scripts/") ||
    label.startsWith("tests/") ||
    label.startsWith("benchmarks/") ||
    label.startsWith("server/") ||
    label.startsWith("plugin/") ||
    label.startsWith("create-cachou/") ||
    label.startsWith("crm/scripts/");
  const isGeneratedComponent =
    /(^|\/)components\/[^/]+\.js$/.test(label) || /^demo\/components\/[^/]+\.js$/.test(label);
  const isAppSurface =
    label.startsWith("crm/src/") || label.startsWith("demo/") || label.startsWith("examples/");

  if (isGeneratedComponent && content.includes("$${")) {
    issues.push(`${label}: generated template contains a \${"{...}"} interpolation artifact`);
  }

  const isFrameworkCore = label.startsWith("src/");
  if (
    isFrameworkCore &&
    /set(?:Timeout|Interval)\s*\(/.test(content) &&
    !/clear(?:Timeout|Interval)\s*\(/.test(content) &&
    !/onCleanup\s*\(/.test(content)
  ) {
    issues.push(`${label}: timer is created without a matching clear call`);
  }

  if (
    isAppSurface &&
    /addEventListener\s*\(/.test(content) &&
    !/removeEventListener\s*\(/.test(content) &&
    !/onCleanup\s*\(/.test(content)
  ) {
    issues.push(`${label}: event listener is added without cleanup`);
  }

  if (isAppSurface && /mapArray\s*\([^)]*\)/s.test(content) && !/uniqueKeys\s*:\s*true/.test(content)) {
    issues.push(`${label}: mapArray should declare uniqueKeys: true for stable keyed rendering`);
  }

  if (isAppSurface && /fetch\s*\(/.test(content) && !/AbortController|timeoutMs|signal\s*:/.test(content)) {
    issues.push(`${label}: fetch call should use an abort signal or resource timeout`);
  }
}

if (issues.length > 0) {
  console.error("Guardrail checks failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Guardrail checks passed (${files.length} files)`);
