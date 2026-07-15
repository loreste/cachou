import { cp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const crmRoot = path.join(root, "crm");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(crmRoot, "artifacts", "ci", stamp);
const logsDir = path.join(runDir, "logs");

await mkdir(logsDir, { recursive: true });

const steps = [
  ["crm-qa", ["run", "crm:qa"]],
  ["root-check", ["run", "check"]],
  ["benchmark-report", ["run", "crm:bench:report"]]
];

for (const [name, args] of steps) {
  await runStep(name, args);
}

const copies = [
  ["screenshots", path.join(crmRoot, "artifacts", "screenshots")],
  ["screenshots-baseline", path.join(crmRoot, "artifacts", "screenshots-baseline")],
  ["benchmarks", path.join(crmRoot, "artifacts", "benchmarks")],
  ["dist", path.join(crmRoot, "dist")]
];

for (const [name, source] of copies) {
  if (existsSync(source)) {
    await cp(source, path.join(runDir, name), { recursive: true });
  }
}

await writeFile(path.join(runDir, "manifest.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  steps: steps.map(([name]) => name),
  artifacts: copies.filter(([, source]) => existsSync(source)).map(([name]) => name)
}, null, 2));

console.log(`CRM CI artifacts written to ${path.relative(root, runDir)}`);

function runStep(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const lines = [];
    child.stdout.on("data", chunk => {
      process.stdout.write(chunk);
      lines.push(chunk.toString());
    });
    child.stderr.on("data", chunk => {
      process.stderr.write(chunk);
      lines.push(chunk.toString());
    });
    child.on("error", reject);
    child.on("close", async code => {
      await writeFile(path.join(logsDir, `${name}.log`), lines.join(""));
      if (code === 0) resolve();
      else reject(new Error(`${name} failed with exit code ${code}`));
    });
  });
}
