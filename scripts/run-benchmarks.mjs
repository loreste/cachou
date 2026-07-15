import { spawn } from "node:child_process";
import { once } from "node:events";

const port = Number(process.env.CACHOU_BENCH_PORT || 5178);
const url = `http://127.0.0.1:${port}/benchmarks/`;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {}
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
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `osascript exited with code ${code}`));
      }
    });
  });
}

async function runSafariBenchmarks() {
  const script = `
    tell application "Safari"
      activate
      if (count of windows) = 0 then make new document
      set URL of front document to "${url}"
      repeat 300 times
        delay 0.1
        set pageTitle to name of front document
        if pageTitle starts with "CACHOU_BENCH_DONE:" then return pageTitle
      end repeat
      error "Timed out waiting for benchmarks"
    end tell
  `;
  const title = await runOsascript(script);
  const parts = title.split(":");
  return {
    total: Number(parts[1]),
    failed: Number(parts[2]),
    failedNames: parts[3]
      ? parts[3].split(",").filter(Boolean).map(decodeURIComponent)
      : []
  };
}

const vite = spawn("./node_modules/.bin/vite", [
  "--host", "127.0.0.1",
  "--port", String(port),
  "--strictPort"
], {
  stdio: ["ignore", "pipe", "pipe"]
});

let viteOutput = "";
vite.stdout.on("data", chunk => viteOutput += chunk);
vite.stderr.on("data", chunk => viteOutput += chunk);

try {
  await waitForServer();
  const summary = await runSafariBenchmarks();
  console.log(`Benchmarks: ${summary.total - summary.failed}/${summary.total} within baseline threshold`);
  if (summary.failed > 0) {
    for (const name of summary.failedNames) {
      console.error(`REGRESSION ${name}`);
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
  await Promise.race([
    once(vite, "close"),
    wait(2000)
  ]);
}
