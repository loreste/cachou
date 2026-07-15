import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const port = Number(process.env.CACHOU_COMPARE_PORT || 5179);
const samples = Math.max(1, Number(process.env.CACHOU_COMPARE_SAMPLES || 3));
const url = `http://127.0.0.1:${port}/benchmarks/compare/?samples=${samples}`;
const resultsPath =
  process.env.CACHOU_COMPARE_RESULTS_PATH || join(tmpdir(), `cachou-compare-results-${port}.json`);
const reportPath = process.env.CACHOU_COMPARE_REPORT_PATH || "";
const historyPath =
  process.env.CACHOU_COMPARE_HISTORY_PATH || (reportPath ? join(dirname(reportPath), "history.json") : "");
const preferSafari = process.env.CACHOU_TEST_BROWSER === "safari";
const preferPlaywright =
  process.env.CACHOU_TEST_BROWSER === "chromium" ||
  process.env.CACHOU_TEST_BROWSER === "playwright";

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for Vite at ${url}`);
}

function runOsascript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-e", script], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => (stdout += chunk));
    child.stderr.on("data", chunk => (stderr += chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `osascript exited with code ${code}`));
    });
  });
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readBenchmarkResults() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(resultsPath, "utf8"));
    } catch {
      await wait(100);
    }
  }
  return { summary: [] };
}

async function runSafariComparison() {
  const script = `
    tell application "Safari"
      activate
      if (count of windows) = 0 then make new document
      set URL of front document to "${url}"
      repeat 300 times
        delay 0.1
        set pageTitle to name of front document
        if pageTitle starts with "CACHOU_COMPARE_DONE:" then return pageTitle
      end repeat
      error "Timed out waiting for competitive benchmarks"
    end tell
  `;
  const title = await runOsascript(script);
  const parts = title.split(":");
  const results = await readBenchmarkResults();
  return {
    adapters: Number(parts[1]),
    scenarios: Number(parts[2]),
    failed: Number(parts[3]),
    failures: results.failures || (parts[4] ? parts[4].split(",").filter(Boolean).map(safeDecode) : []),
    summary: results.summary || [],
    runner: "safari"
  };
}

async function runPlaywrightComparison() {
  const require = createRequire(import.meta.url);
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. Run: npx playwright install chromium\n" +
        "Or set CACHOU_TEST_BROWSER=safari on macOS."
    );
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(
      () => typeof window.__CACHOU_COMPARE_RESULTS__ === "object" && window.__CACHOU_COMPARE_RESULTS__ !== null,
      null,
      { timeout: 180000 }
    );
    const results = await page.evaluate(() => window.__CACHOU_COMPARE_RESULTS__);
    const title = await page.title();
    const parts = title.startsWith("CACHOU_COMPARE_DONE:") ? title.split(":") : [];
    const adapters = Number(parts[1]) || 0;
    const scenarios = Number(parts[2]) || 0;
    const failed = Number(parts[3]) || (results.failures || []).length;
    // Infer adapter/scenario counts from summary when title parsing fails.
    const summary = results.summary || [];
    const adapterNames = new Set(summary.map(item => item.adapter));
    const scenarioNames = new Set(summary.map(item => item.scenario));
    return {
      adapters: adapters || adapterNames.size,
      scenarios: scenarios || scenarioNames.size,
      failed,
      failures: results.failures || [],
      summary,
      runner: "playwright-chromium"
    };
  } finally {
    await browser.close();
  }
}

async function runComparison() {
  if (preferSafari) return runSafariComparison();
  if (preferPlaywright) return runPlaywrightComparison();

  try {
    return await runPlaywrightComparison();
  } catch (playwrightErr) {
    if (process.platform === "darwin") {
      console.warn(`Playwright unavailable (${playwrightErr.message}). Falling back to Safari.`);
      return runSafariComparison();
    }
    throw playwrightErr;
  }
}

function printStandings(summary) {
  const byScenario = new Map();
  for (const item of summary) {
    if (!byScenario.has(item.scenario)) {
      byScenario.set(item.scenario, []);
    }
    byScenario.get(item.scenario).push(item);
  }

  for (const [scenario, items] of byScenario) {
    const ranked = items
      .filter(item => Number.isFinite(item.duration))
      .sort((a, b) => a.duration - b.duration);
    const cachou = ranked.find(item => item.adapter === "CachouJS");
    const cachouRank = cachou ? ranked.indexOf(cachou) + 1 : "n/a";
    const fastest = ranked[0];
    const line = ranked
      .map((item, index) => {
        const stats = item.stats
          ? ` p95=${item.stats.p95.toFixed(2)} σ=${item.stats.stddev.toFixed(2)}`
          : "";
        return `${index + 1}. ${item.adapter} ${item.duration.toFixed(2)}ms${stats}`;
      })
      .join(" | ");
    console.log(
      `${scenario}: CachouJS rank ${cachouRank}/${ranked.length}; fastest ${fastest?.adapter ?? "n/a"} ${fastest ? fastest.duration.toFixed(2) + "ms" : ""}`
    );
    console.log(`  ${line}`);
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function summarizeReport(report) {
  const scenarios = [];
  const byScenario = new Map();
  for (const item of report.summary || []) {
    if (!byScenario.has(item.scenario)) byScenario.set(item.scenario, []);
    byScenario.get(item.scenario).push(item);
  }
  for (const [scenario, items] of byScenario) {
    const ranked = items
      .filter(item => Number.isFinite(item.duration))
      .sort((a, b) => a.duration - b.duration);
    const cachou = ranked.find(item => item.adapter === "CachouJS");
    scenarios.push({
      scenario,
      rank: cachou ? ranked.indexOf(cachou) + 1 : null,
      total: ranked.length,
      duration: cachou?.duration ?? null,
      p95: cachou?.stats?.p95 ?? null
    });
  }
  return { generatedAt: report.generatedAt, failed: report.failed, scenarios };
}

const vite = spawn(
  "./node_modules/.bin/vite",
  ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CACHOU_COMPARE_RESULTS_PATH: resultsPath
    }
  }
);

let viteOutput = "";
vite.stdout.on("data", chunk => (viteOutput += chunk));
vite.stderr.on("data", chunk => (viteOutput += chunk));

try {
  await rm(resultsPath, { force: true });
  await waitForServer();
  const summary = await runComparison();
  const total = summary.adapters * summary.scenarios;
  console.log(
    `Competitive benchmarks (${summary.runner}): ${total - summary.failed}/${total} completed`
  );
  printStandings(summary.summary);
  if (reportPath) {
    const generatedAt = new Date().toISOString();
    const report = { generatedAt, ...summary };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await writeFile(
      join(dirname(reportPath), `${generatedAt.replace(/[:.]/g, "-")}-${basename(reportPath)}`),
      JSON.stringify(report, null, 2)
    );
    if (historyPath) {
      const history = await readJson(historyPath, []);
      history.push(summarizeReport(report));
      await writeFile(historyPath, JSON.stringify(history.slice(-50), null, 2));
    }
    console.log(`Benchmark report written: ${reportPath}`);
  }
  if (summary.failed > 0) {
    for (const failure of summary.failures) {
      console.error(`FAIL ${failure}`);
    }
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err.message);
  if (viteOutput.trim()) {
    console.error(viteOutput.trim());
  }
  process.exitCode = 1;
} finally {
  vite.kill("SIGTERM");
  await Promise.race([once(vite, "close"), wait(2000)]);
}
