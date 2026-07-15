import { spawn } from "node:child_process";
import net from "node:net";

const apiPort = await freePort(6200, 7000);
const webPort = await freePort(7001, 7600);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(command, args, env = {}) {
  return spawn(command, args, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitFor(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await wait(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function osascript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `osascript exited with ${code}`));
    });
  });
}

function freePort(start, end) {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryPort = () => {
      if (port > end) {
        reject(new Error(`No free port found from ${start} to ${end}`));
        return;
      }
      const probe = net.createServer();
      probe.once("error", () => {
        port += 1;
        tryPort();
      });
      probe.once("listening", () => {
        const selected = port;
        probe.close(() => resolve(selected));
      });
      probe.listen(port, "127.0.0.1");
    };
    tryPort();
  });
}

const api = run("npm", ["run", "api"], {
  CRM_API_PORT: String(apiPort),
  CRM_CORS_ORIGINS: webUrl,
  CRM_DB_MODE: process.env.CRM_DB_MODE || "memory",
  POSTGRES_DSN: process.env.POSTGRES_DSN || ""
});
const web = run("node", ["../node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
  VITE_CRM_API_URL: apiUrl,
  VITE_CRM_DEMO_AUTOSIGNIN: "manager"
});

let output = "";
for (const child of [api, web]) {
  child.stdout.on("data", chunk => output += chunk);
  child.stderr.on("data", chunk => output += chunk);
}

try {
  await waitFor(`${apiUrl}/api/health`);
  await waitFor(webUrl);
  const script = `
    tell application "Safari"
      activate
      if (count of windows) = 0 then make new document
      set URL of front document to "${webUrl}"
      repeat 120 times
        delay 0.1
        set pageTitle to name of front document
        if pageTitle starts with "CACHOU_CRM_READY:" then return pageTitle
      end repeat
      error "CRM UI did not finish rendering"
    end tell
  `;
  await osascript(script);
  const noAuthScript = `
    tell application "Safari"
      set URL of front document to "${webUrl}/?noauth=" & (do shell script "date +%s")
      delay 0.2
      do JavaScript "localStorage.removeItem('cachou_crm_session'); window.__crmFetches = []; const originalFetch = window.fetch; window.fetch = function(input, init) { const url = String(input && input.url ? input.url : input); window.__crmFetches.push(url); return originalFetch.apply(this, arguments); }; location.reload();" in front document
      repeat 80 times
        delay 0.1
        set bodyText to do JavaScript "document.body.innerText" in front document
        if bodyText contains "Sign in" then exit repeat
      end repeat
      delay 0.5
      return do JavaScript "JSON.stringify(window.__crmFetches || [])" in front document
    end tell
  `;
  try {
    const fetches = JSON.parse(await osascript(noAuthScript) || "[]");
    const protectedFetch = fetches.find(url => /\/api\/(workspace|security|db\/diagnostics|ops\/metrics)/.test(url));
    if (protectedFetch) {
      throw new Error(`Unauthenticated startup fetched protected endpoint: ${protectedFetch}`);
    }
  } catch (err) {
    if (!String(err.message || "").includes("Allow JavaScript from Apple Events")) throw err;
    console.warn("Skipped unauthenticated fetch audit because Safari JavaScript automation is disabled");
  }
  console.log("CRM UI smoke passed");
} catch (err) {
  console.error(err.message);
  if (output.trim()) console.error(output.trim());
  process.exitCode = 1;
} finally {
  api.kill("SIGTERM");
  web.kill("SIGTERM");
}
