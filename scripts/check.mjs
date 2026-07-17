import { spawn } from "node:child_process";

const commands = [
  ["node", ["--check", "src/reactivity.js"]],
  ["node", ["--check", "src/dom-cleanup.js"]],
  ["node", ["--check", "src/html.js"]],
  ["node", ["--check", "src/logger.js"]],
  ["node", ["--check", "src/tracing.js"]],
  ["node", ["--check", "src/router.js"]],
  ["node", ["--check", "src/router-state.js"]],
  ["node", ["--check", "src/ssr-context.js"]],
  ["node", ["--check", "src/forms.js"]],
  ["node", ["--check", "src/a11y.js"]],
  ["node", ["--check", "src/virtual-list.js"]],
  ["node", ["--check", "src/browser.js"]],
  ["node", ["--check", "plugin/vite.js"]],
  ["node", ["--check", "server/demo-guard.js"]],
  ["node", ["--check", "tests/tests.js"]],
  ["node", ["--check", "benchmarks/perf.js"]],
  ["node", ["--check", "benchmarks/memory/run.js"]],
  ["node", ["--check", "benchmarks/compare/run.js"]],
  ["node", ["--check", "benchmarks/compare/scenarios.js"]],
  ["node", ["--check", "benchmarks/compare/adapters/cachou.js"]],
  ["node", ["--check", "benchmarks/compare/adapters/vanilla.js"]],
  ["node", ["--check", "benchmarks/compare/adapters/react.js"]],
  ["node", ["--check", "benchmarks/compare/adapters/vue.js"]],
  ["node", ["--check", "benchmarks/compare/adapters/preact.js"]],
  ["node", ["--check", "benchmarks/compare/adapters/solid.js"]],
  ["node", ["--check", "benchmarks/compare/adapters/svelte.js"]],
  ["node", ["--check", "scripts/run-browser-tests.mjs"]],
  ["node", ["--check", "scripts/run-benchmarks.mjs"]],
  ["node", ["--check", "scripts/run-memory-benchmarks.mjs"]],
  ["node", ["--check", "scripts/run-competitive-benchmarks.mjs"]],
  ["node", ["--check", "scripts/run-ssr-benchmarks.mjs"]],
  ["node", ["--check", "scripts/run-compiler.mjs"]],
  ["node", ["--check", "scripts/check-compiler-diagnostics.mjs"]],
  ["node", ["--check", "scripts/guardrails.mjs"]],
  ["node", ["--check", "crm/scripts/stress.mjs"]],
  ["node", ["--check", "crm/scripts/visual-smoke.mjs"]],
  ["node", ["--check", "crm/scripts/perf.mjs"]],
  ["node", ["--check", "crm/vite.config.mjs"]],
  ["node", ["--check", "crm/scripts/start-demo.mjs"]],
  ["node", ["--test", "tests/unit/reactivity.test.js"]],
  ["node", ["--test", "tests/unit/v04-apis.test.js"]],
  ["node", ["--test", "tests/unit/demo-guard.test.js"]],
  ["node", ["--test", "tests/unit/flow.test.js"]],
  ["node", ["--test", "tests/unit/mapArray.test.js"]],
  ["node", ["--test", "tests/unit/virtual-list.test.js"]],
  ["node", ["--test", "tests/unit/browser-entry.test.js"]],
  ["node", ["--test", "tests/unit/store.test.js"]],
  ["node", ["--test", "tests/unit/ssr-concurrent.test.js"]],
  ["node", ["--test", "tests/unit/file-routes.test.js"]],
  ["node", ["--test", "tests/unit/compiler-js.test.js"]],
  ["node", ["--test", "tests/files.test.js"]],
  ["node", ["scripts/guardrails.mjs"]],
  ["npm", ["run", "compiler:build"]],
  ["node", ["scripts/run-compiler.mjs", "-dir", "demo/components", "-out", "/tmp/cachou-check-components", "-runtime", "cachoujs"]],
  ["node", ["scripts/run-compiler.mjs", "-dir", "tests/compiler-fixtures", "-out", "/tmp/cachou-check-fixtures", "-runtime", "cachoujs"]],
  ["node", ["scripts/check-compiler-parity.mjs"]],
  ["node", ["scripts/check-compiler-diagnostics.mjs"]],
  ["./node_modules/.bin/vite", ["build", "--outDir", "/tmp/cachou-check-build"]],
  ["node", ["scripts/run-browser-tests.mjs"]],
  ["node", ["scripts/run-benchmarks.mjs"]],
  ["node", ["scripts/run-memory-benchmarks.mjs"]],
  ["node", ["scripts/run-competitive-benchmarks.mjs"]],
  ["node", ["scripts/run-ssr-benchmarks.mjs"]]
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${[command, ...args].join(" ")}`);
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, CACHOU_DEMO: process.env.CACHOU_DEMO || "1" }
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

for (const [command, args] of commands) {
  await run(command, args);
}

console.log("\n⚡ All checks passed.");
