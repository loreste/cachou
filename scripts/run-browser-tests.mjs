import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "module";
import { pathToFileURL } from "node:url";

const port = Number(process.env.CACHOU_TEST_PORT || 5177);
const url = `http://127.0.0.1:${port}/tests/`;
const preferSafari = process.env.CACHOU_TEST_BROWSER === "safari";
const preferPlaywright = process.env.CACHOU_TEST_BROWSER === "chromium" || process.env.CACHOU_TEST_BROWSER === "playwright";

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 20000;
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

async function runSafariTests() {
  const script = `
    tell application "Safari"
      activate
      if (count of windows) = 0 then make new document
      set URL of front document to "${url}"
      repeat 200 times
        delay 0.1
        set pageTitle to name of front document
        if pageTitle starts with "CACHOU_TESTS_DONE:" then return pageTitle
      end repeat
      error "Timed out waiting for browser tests"
    end tell
  `;
  const title = await runOsascript(script);
  const parts = title.split(":");
  return {
    passed: Number(parts[1]),
    failed: Number(parts[2]),
    total: Number(parts[3]),
    failedNames: parts[4] ? parts[4].split(",").filter(Boolean).map(decodeURIComponent) : [],
    runner: "safari"
  };
}

async function runPlaywrightTests() {
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
    await page.waitForFunction(() => window.__CACHOU_TEST_DONE__ === true, null, { timeout: 60000 });
    const summary = await page.evaluate(() => window.__CACHOU_TEST_RESULTS__);
    return {
      passed: summary.passed,
      failed: summary.failed,
      total: summary.total,
      failedNames: (summary.results || [])
        .filter(r => !r.passed)
        .map(r => r.name),
      runner: "playwright-chromium"
    };
  } finally {
    await browser.close();
  }
}

async function runBrowserTests() {
  if (preferSafari) return runSafariTests();
  if (preferPlaywright) return runPlaywrightTests();

  // Default: Playwright/Chromium when available, else Safari on macOS.
  try {
    return await runPlaywrightTests();
  } catch (playwrightErr) {
    if (process.platform === "darwin") {
      console.warn(`Playwright unavailable (${playwrightErr.message}). Falling back to Safari.`);
      return runSafariTests();
    }
    throw playwrightErr;
  }
}

const vite = spawn(
  "./node_modules/.bin/vite",
  ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CACHOU_DEMO: "1" }
  }
);

let viteOutput = "";
vite.stdout.on("data", chunk => (viteOutput += chunk));
vite.stderr.on("data", chunk => (viteOutput += chunk));

try {
  await waitForServer();
  const summary = await runBrowserTests();
  console.log(`Browser tests (${summary.runner}): ${summary.passed}/${summary.total} passed`);
  if (summary.failed > 0) {
    for (const name of summary.failedNames) {
      console.error(`FAIL ${name}`);
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
