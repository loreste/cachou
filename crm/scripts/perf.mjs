import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const sampleCount = Math.max(1, Number(process.env.CRM_PERF_SAMPLES || 3));
const benchmarkMode = process.env.CRM_PERF_MODE || "production";
const crmRoot = fileURLToPath(new URL("..", import.meta.url));
const apiPort = await freePort(9100, 9800);
const webPort = await freePort(9801, 10600);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const buildDir = process.env.CRM_PERF_BUILD_DIR || join(tmpdir(), `cachou-crm-perf-${process.pid}`);
const ownsBuildDir = !process.env.CRM_PERF_BUILD_DIR;

function freePort(start, end) {
  return new Promise((resolve, reject) => {
    let port = start;
    const probe = () => {
      if (port > end) {
        reject(new Error(`No free port found from ${start} to ${end}`));
        return;
      }
      const server = net.createServer();
      server.once("error", () => {
        port++;
        probe();
      });
      server.once("listening", () => {
        const selected = port;
        server.close(() => resolve(selected));
      });
      server.listen(port, "127.0.0.1");
    };
    probe();
  });
}

function run(command, args, env = {}) {
  return spawn(command, args, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runBuild(env = {}) {
  const child = run(
    "node",
    ["../node_modules/vite/bin/vite.js", "build", "--outDir", buildDir, "--emptyOutDir"],
    env
  );
  let output = "";
  child.stdout.on("data", chunk => output += chunk);
  child.stderr.on("data", chunk => output += chunk);
  return new Promise((resolveBuild, reject) => {
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolveBuild(output);
      else reject(new Error(`CRM production build exited with code ${code}\n${output}`));
    });
  });
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
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

function startStaticServer(rootDir) {
  return new Promise((resolveServer, reject) => {
    const root = resolve(rootDir);
    const server = createServer(async (request, response) => {
      try {
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" });
          response.end();
          return;
        }
        const requestUrl = new URL(request.url || "/", webUrl);
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
        const fileStats = await stat(file);
        if (fileStats.isDirectory()) file = join(file, "index.html");
        await stat(file);
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": contentTypes[extname(file).toLowerCase()] || "application/octet-stream"
        });
        if (request.method === "HEAD") response.end();
        else response.end(await readFile(file));
      } catch {
        if (!response.headersSent) response.writeHead(404);
        response.end();
      }
    });
    server.once("error", reject);
    server.listen(webPort, "127.0.0.1", () => resolveServer(server));
  });
}

function stopStaticServer(server) {
  if (!server) return Promise.resolve();
  return new Promise(resolveServer => server.close(() => resolveServer()));
}

async function waitFor(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The API and Vite processes start independently.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function copyBenchmarkArtifacts() {
  try {
    await cp(
      join(crmRoot, "artifacts", "benchmarks"),
      join(buildDir, "artifacts", "benchmarks"),
      { recursive: true }
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function percentile(values, fraction) {
  const index = Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1);
  return values[index];
}

async function clickUntil(page, buttonName, predicate) {
  await page.evaluate(name => {
    window.__crmPerfStart = null;
    const handler = event => {
      const button = event.target.closest?.("button");
      if (button?.textContent?.trim() === name) {
        window.__crmPerfStart = performance.now();
        document.removeEventListener("click", handler, true);
      }
    };
    document.addEventListener("click", handler, true);
  }, buttonName);
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await page.waitForFunction(predicate, null, { timeout: 120000 });
  return page.evaluate(() => performance.now() - window.__crmPerfStart);
}

async function runSample(browser, sample) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", request => {
    errors.push(`request: ${request.url()} (${request.failure()?.errorText || "failed"})`);
  });

  try {
    const readyStart = performance.now();
    await page.goto(`${webUrl}/?crmPerf=${sample}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(
      () => document.title.startsWith("CACHOU_CRM_READY:overview:"),
      null,
      { timeout: 120000 }
    );
    const readyMs = performance.now() - readyStart;

    await page.getByRole("button", { name: "performance lab", exact: true }).click();
    await page.waitForFunction(
      () => document.title.startsWith("CACHOU_CRM_READY:performance-lab:"),
      null,
      { timeout: 30000 }
    );

    const loadMs = await clickUntil(
      page,
      "Load 5,000 contacts",
      () => document.title.startsWith("CACHOU_CRM_READY:performance-lab:5000:")
    );

    await page.getByRole("button", { name: "contacts", exact: true }).click();
    await page.waitForFunction(
      () => document.title.startsWith("CACHOU_CRM_READY:contacts:5000:"),
      null,
      { timeout: 120000 }
    );
    await page.waitForFunction(
      () => {
        const rows = document.querySelectorAll(".list .row").length;
        return rows > 0 && rows <= 64;
      },
      null,
      { timeout: 120000 }
    );
    await page.evaluate(() => {
      const list = document.querySelector(".list");
      if (!list) throw new Error("CRM contact list was not rendered");
      if (list.scrollHeight < 5000 * 60) throw new Error("CRM virtual list did not preserve full scroll height");
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll(".list .row")).some(row => row.textContent.includes("Demo Contact 5000")),
      null,
      { timeout: 30000 }
    );
    await page.evaluate(() => {
      const list = document.querySelector(".list");
      list.scrollTop = 0;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll(".list .row")).some(row => row.textContent.includes("Demo Contact 1")),
      null,
      { timeout: 30000 }
    );

    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Search contacts"]');
      if (!input) throw new Error("CRM search input was not rendered");
      window.__crmPerfStart = null;
      input.addEventListener("input", () => {
        if (window.__crmPerfStart === null) window.__crmPerfStart = performance.now();
      }, { once: true });
      input.value = "Demo Contact 5000";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(
      () => document.querySelectorAll(".list .row").length === 1,
      null,
      { timeout: 30000 }
    );
    const searchMs = await page.evaluate(() => performance.now() - window.__crmPerfStart);

    await page.getByRole("button", { name: "performance lab", exact: true }).click();
    await page.waitForFunction(
      () => document.title.startsWith("CACHOU_CRM_READY:performance-lab:5000:"),
      null,
      { timeout: 30000 }
    );
    const routeMs = await clickUntil(
      page,
      "Route churn x40",
      () => document.title.startsWith("CACHOU_CRM_READY:pipeline:5000:")
    );

    if (errors.length > 0) throw new Error(errors.join("; "));
    return { readyMs, loadMs, searchMs, routeMs };
  } finally {
    await page.close();
  }
}

const api = run("npm", ["run", "api"], {
  CRM_API_PORT: String(apiPort),
  CRM_CORS_ORIGINS: webUrl,
  CRM_DB_MODE: process.env.CRM_DB_MODE || "memory"
});
let output = "";
function capture(child) {
  child.stdout.on("data", chunk => output += chunk);
  child.stderr.on("data", chunk => output += chunk);
}
capture(api);
let web = null;
let staticServer = null;
let buildOutput = "";

try {
  await waitFor(`${apiUrl}/api/health`);
  const webEnv = {
    VITE_CRM_API_URL: apiUrl,
    VITE_CRM_DEMO_AUTOSIGNIN: "manager"
  };
  if (benchmarkMode === "production") {
    await mkdir(buildDir, { recursive: true });
    buildOutput = await runBuild(webEnv);
    await copyBenchmarkArtifacts();
    staticServer = await startStaticServer(buildDir);
  } else if (benchmarkMode === "dev") {
    web = run("node", ["../node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], webEnv);
    capture(web);
  } else {
    throw new Error(`Unsupported CRM_PERF_MODE: ${benchmarkMode}`);
  }
  await waitFor(webUrl);

  let playwright;
  try {
    playwright = createRequire(import.meta.url)("playwright");
  } catch {
    throw new Error("Playwright is required for CRM performance runs.");
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const samples = [];
    for (let sample = 0; sample < sampleCount; sample++) {
      samples.push(await runSample(browser, sample));
    }
    const result = { sampleCount, samples, median: {} };
    for (const key of ["readyMs", "loadMs", "searchMs", "routeMs"]) {
      const values = samples.map(sample => sample[key]).sort((a, b) => a - b);
      result.median[key] = values[Math.floor(values.length / 2)];
      result[`${key}P95`] = percentile(values, 0.95);
    }
    console.log(JSON.stringify(result, null, 2));
    console.log(
      `CRM performance passed (${sampleCount} samples, ${benchmarkMode}): ` +
      `ready ${result.median.readyMs.toFixed(2)}ms, ` +
      `load ${result.median.loadMs.toFixed(2)}ms, ` +
      `search ${result.median.searchMs.toFixed(2)}ms, ` +
      `route ${result.median.routeMs.toFixed(2)}ms`
    );
  } finally {
    await browser.close();
  }
} catch (error) {
  console.error(error.message);
  if (buildOutput.trim()) console.error(buildOutput.trim());
  if (output.trim()) console.error(output.trim());
  process.exitCode = 1;
} finally {
  api.kill("SIGTERM");
  await stopStaticServer(staticServer);
  if (web) web.kill("SIGTERM");
  if (ownsBuildDir) await rm(buildDir, { recursive: true, force: true });
}
