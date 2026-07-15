import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "module";

const port = Number(process.env.CACHOU_MEMORY_PORT || 5180);
const url = `http://127.0.0.1:${port}/benchmarks/memory/`;
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

async function runSafariMemoryBenchmarks() {
  const title = await runOsascript(`
    tell application "Safari"
      activate
      if (count of windows) = 0 then make new document
      set URL of front document to "${url}"
      repeat 300 times
        delay 0.1
        set pageTitle to name of front document
        if pageTitle starts with "CACHOU_MEMORY_DONE:" then return pageTitle
      end repeat
      error "Timed out waiting for memory benchmarks"
    end tell
  `);
  const parts = title.split(":");
  return {
    passed: Number(parts[1]),
    failed: Number(parts[2]),
    failures: parts[3] ? parts[3].split(",").filter(Boolean).map(decodeURIComponent) : [],
    runner: "safari"
  };
}

async function runPlaywrightMemoryBenchmarks() {
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
      () => typeof window.__CACHOU_MEMORY_RESULTS__ === "object" && window.__CACHOU_MEMORY_RESULTS__ !== null,
      null,
      { timeout: 120000 }
    );
    const results = await page.evaluate(() => window.__CACHOU_MEMORY_RESULTS__);
    return {
      passed: (results.summary || []).length,
      failed: (results.failures || []).length,
      failures: results.failures || [],
      runner: "playwright-chromium"
    };
  } finally {
    await browser.close();
  }
}

async function runMemoryBenchmarks() {
  if (preferSafari) return runSafariMemoryBenchmarks();
  if (preferPlaywright) return runPlaywrightMemoryBenchmarks();

  try {
    return await runPlaywrightMemoryBenchmarks();
  } catch (playwrightErr) {
    if (process.platform === "darwin") {
      console.warn(`Playwright unavailable (${playwrightErr.message}). Falling back to Safari.`);
      return runSafariMemoryBenchmarks();
    }
    throw playwrightErr;
  }
}

const vite = spawn(
  "./node_modules/.bin/vite",
  ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let viteOutput = "";
vite.stdout.on("data", chunk => (viteOutput += chunk));
vite.stderr.on("data", chunk => (viteOutput += chunk));

try {
  await waitForServer();
  const summary = await runMemoryBenchmarks();
  console.log(
    `Memory benchmarks (${summary.runner}): ${summary.passed}/${summary.passed + summary.failed} passed`
  );
  if (summary.failed > 0) {
    for (const failure of summary.failures) {
      console.error(`MEMORY ${failure}`);
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
