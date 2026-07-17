import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "module";
import { createServer } from "node:http";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { cpus, release, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";

const require = createRequire(import.meta.url);
const projectPackage = require("../package.json");
const port = Number(process.env.CACHOU_COMPARE_PORT || 5179);
const samples = Math.max(1, Number(process.env.CACHOU_COMPARE_SAMPLES || 3));
const benchmarkMode = process.env.CACHOU_COMPARE_MODE || "production";
const buildDir =
  process.env.CACHOU_COMPARE_BUILD_DIR || join(tmpdir(), `cachou-compare-build-${process.pid}`);
const ownsBuildDir = !process.env.CACHOU_COMPARE_BUILD_DIR;
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
const hostCpus = cpus();

function packageVersion(name) {
  try {
    return require(`${name}/package.json`).version;
  } catch {
    return name === "cachoujs" ? projectPackage.version : null;
  }
}

const frameworkVersions = {
  cachoujs: packageVersion("cachoujs"),
  react: packageVersion("react"),
  "react-dom": packageVersion("react-dom"),
  vue: packageVersion("vue"),
  preact: packageVersion("preact"),
  "solid-js": packageVersion("solid-js"),
  svelte: packageVersion("svelte")
};

const toolingVersions = {
  playwright: packageVersion("playwright"),
  vite: packageVersion("vite")
};

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
  throw new Error(`Timed out waiting for benchmark server at ${url}`);
}

function runProcess(command, args, env = {}) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env }
    });
    let output = "";
    child.stdout.on("data", chunk => (output += chunk));
    child.stderr.on("data", chunk => (output += chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) {
        resolveProcess(output);
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}\n${output}`));
      }
    });
  });
}

async function buildProductionBundle() {
  return runProcess("./node_modules/.bin/vite", ["build", "--outDir", buildDir, "--emptyOutDir"]);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function readRequestBody(request, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Benchmark result body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolveBody(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function serveProductionRequest(request, response) {
  const requestUrl = new URL(request.url || "/", url);
  if (requestUrl.pathname === "/__cachou_compare_results__") {
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST" });
      response.end();
      return;
    }
    const body = await readRequestBody(request);
    await writeFile(resultsPath, body);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const root = resolve(buildDir);
  const requestedPath = requestUrl.pathname.endsWith("/")
    ? `${requestUrl.pathname}index.html`
    : requestUrl.pathname;
  const filePath = resolve(root, `.${requestedPath}`);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403);
    response.end();
    return;
  }

  let file = filePath;
  try {
    const fileStats = await stat(file);
    if (fileStats.isDirectory()) file = join(file, "index.html");
    await stat(file);
  } catch {
    response.writeHead(404);
    response.end();
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[extname(file).toLowerCase()] || "application/octet-stream"
  });
  if (request.method === "HEAD") {
    response.end();
  } else {
    response.end(await readFile(file));
  }
}

function startProductionServer() {
  return new Promise((resolveServer, reject) => {
    const server = createServer((request, response) => {
      serveProductionRequest(request, response).catch(error => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
        console.error(`Benchmark server error: ${error.message}`);
      });
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolveServer(server));
  });
}

function stopServer(server) {
  if (!server) return Promise.resolve();
  return new Promise(resolveServer => server.close(() => resolveServer()));
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
    runner: "safari",
    browser: { name: "safari", version: null, userAgent: null }
  };
}

async function runPlaywrightComparison() {
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
    const browserDetails = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio: window.devicePixelRatio
    }));
    return {
      adapters: adapters || adapterNames.size,
      scenarios: scenarios || scenarioNames.size,
      failed,
      failures: results.failures || [],
      summary,
      runner: "playwright-chromium",
      browser: {
        name: "chromium",
        version: browser.version(),
        ...browserDetails
      }
    };
  } finally {
    await browser.close();
  }
}

function buildReportContract(summary) {
  return {
    mode: benchmarkMode,
    samples,
    warmupSamples: 0,
    cleanupBetweenSamples: true,
    timing: "performance.now",
    adapterCount: summary.adapters,
    scenarioCount: summary.scenarios,
    url
  };
}

function buildReportEnvironment(summary) {
  return {
    host: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      osRelease: release(),
      cpuModel: hostCpus[0]?.model || "unknown",
      cpuCount: hostCpus.length
    },
    browser: summary.browser || { name: null, version: null, userAgent: null },
    frameworkVersions,
    toolingVersions
  };
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
  return {
    generatedAt: report.generatedAt,
    mode: report.contract.mode,
    runner: report.runner,
    samples: report.contract.samples,
    environment: report.environment,
    failed: report.failed,
    scenarios
  };
}

let vite = null;
let staticServer = null;
let benchmarkOutput = "";

try {
  await rm(resultsPath, { force: true });
  if (benchmarkMode === "production") {
    benchmarkOutput = await buildProductionBundle();
    staticServer = await startProductionServer();
  } else if (benchmarkMode === "dev") {
    vite = spawn(
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
    vite.stdout.on("data", chunk => (benchmarkOutput += chunk));
    vite.stderr.on("data", chunk => (benchmarkOutput += chunk));
  } else {
    throw new Error(`Unsupported CACHOU_COMPARE_MODE: ${benchmarkMode}`);
  }
  await waitForServer();
  const summary = await runComparison();
  const total = summary.adapters * summary.scenarios;
  console.log(
    `Competitive benchmarks (${summary.runner}, ${benchmarkMode}): ${total - summary.failed}/${total} completed`
  );
  printStandings(summary.summary);
  if (reportPath) {
    const generatedAt = new Date().toISOString();
    const report = {
      generatedAt,
      ...summary,
      contract: buildReportContract(summary),
      environment: buildReportEnvironment(summary)
    };
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
  if (benchmarkOutput.trim()) {
    console.error(benchmarkOutput.trim());
  }
  process.exitCode = 1;
} finally {
  await stopServer(staticServer);
  if (vite) {
    vite.kill("SIGTERM");
    await Promise.race([once(vite, "close"), wait(2000)]);
  }
  if (ownsBuildDir) await rm(buildDir, { recursive: true, force: true });
}
