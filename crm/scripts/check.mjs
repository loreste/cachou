import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const componentDir = new URL("../src/components", import.meta.url);

function checkGeneratedComponents() {
  const issues = [];
  for (const file of readdirSync(componentDir)) {
    if (!file.endsWith(".js")) continue;
    const path = join(componentDir.pathname, file);
    const content = readFileSync(path, "utf8");
    if (content.includes("$${")) {
      issues.push(`${file}: generated template contains escaped interpolation artifact`);
    }
  }
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
}

const checks = [
  ["server syntax", ["node", "--check", "server.mjs"]],
  ["app syntax", ["node", "--check", "src/app.js"]],
  ["api syntax", ["node", "--check", "src/api.js"]],
  ["smoke", ["npm", "run", "smoke"]]
];

for (const [name, command] of checks) {
  if (name === "smoke") checkGeneratedComponents();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
    env: {
      ...process.env,
      CRM_DB_MODE: process.env.CRM_DB_MODE || "memory"
    }
  });
  if (result.status !== 0) {
    console.error(`CRM check failed: ${name}`);
    process.exit(result.status || 1);
  }
}

console.log("CRM checks passed");
