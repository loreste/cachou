import { spawn } from "node:child_process";
import { inflateSync } from "node:zlib";
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import net from "node:net";

const apiPort = await freePort(7600, 8300);
const webPort = await freePort(8301, 9000);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const screenshotDir = resolve(process.env.CRM_SCREENSHOT_DIR || "artifacts/screenshots");
const baselineDir = resolve(process.env.CRM_SCREENSHOT_BASELINE_DIR || "artifacts/screenshots-baseline");
const updateBaseline = process.env.CRM_UPDATE_VISUAL_BASELINE === "1";
const maxDiffRatio = Number(process.env.CRM_VISUAL_MAX_DIFF_RATIO || 0.012);
const maxAverageDelta = Number(process.env.CRM_VISUAL_MAX_AVG_DELTA || 2.5);
function run(command, args, env = {}) {
  return spawn(command, args, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function command(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
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

const api = run("npm", ["run", "api"], { CRM_API_PORT: String(apiPort), CRM_CORS_ORIGINS: webUrl, FAYDB_MODE: "memory" });
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
  await mkdir(screenshotDir, { recursive: true });
  if (updateBaseline) await mkdir(baselineDir, { recursive: true });
  await waitForUrl(`${apiUrl}/api/health`);
  await waitForUrl(webUrl);
  const captures = [
    ["overview", null],
    ["pipeline", "#pipeline"],
    ["live-room", "#live-room"],
    ["contacts", "#contacts"],
    ["companies", "#companies"],
    ["security", "#security"],
    ["performance-lab", "#performance-lab"],
    ["benchmarks", "#benchmarks"],
    ["collaboration-lab", "#collaboration-lab"]
  ];
  for (const [name, hash] of captures) {
    await openSafari(`${webUrl}/${hash || ""}`);
    const title = await waitForReady(name);
    const parts = title.split(":");
    const panelCount = Number(parts[3] || 0);
    if (panelCount < 2) {
      throw new Error(`Visual marker for ${name} reported too few visible panels: ${title}`);
    }
    await assertRouteLayout(name);
    const screenshotPath = resolve(screenshotDir, `${name}.png`);
    const baselinePath = resolve(baselineDir, `${name}.png`);
    await command("screencapture", ["-x", screenshotPath]).catch(() => {});
    if (updateBaseline) {
      await copyFile(screenshotPath, baselinePath);
    } else if (await exists(baselinePath)) {
      const diff = await comparePngs(baselinePath, screenshotPath);
      if (diff.diffRatio > maxDiffRatio || diff.averageDelta > maxAverageDelta) {
        throw new Error(`Visual regression ${name}: diffRatio=${diff.diffRatio.toFixed(4)} avgDelta=${diff.averageDelta.toFixed(2)}`);
      }
    }
  }
  console.log(`CRM visual smoke passed; screenshots: ${screenshotDir}`);
} catch (err) {
  console.error(err.message);
  if (output.trim()) console.error(output.trim());
  process.exitCode = 1;
} finally {
  api.kill("SIGTERM");
  web.kill("SIGTERM");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function comparePngs(expectedPath, actualPath) {
  const expected = decodePng(await readFile(expectedPath));
  const actual = decodePng(await readFile(actualPath));
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return { diffRatio: 1, averageDelta: 255 };
  }
  let changed = 0;
  let totalDelta = 0;
  const pixels = expected.width * expected.height;
  for (let offset = 0; offset < expected.rgba.length; offset += 4) {
    const delta = Math.abs(expected.rgba[offset] - actual.rgba[offset])
      + Math.abs(expected.rgba[offset + 1] - actual.rgba[offset + 1])
      + Math.abs(expected.rgba[offset + 2] - actual.rgba[offset + 2])
      + Math.abs(expected.rgba[offset + 3] - actual.rgba[offset + 3]);
    if (delta > 24) changed += 1;
    totalDelta += delta / 4;
  }
  return { diffRatio: changed / pixels, averageDelta: totalDelta / pixels };
}

function decodePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Invalid PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const unfiltered = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[input++];
    const row = unfiltered.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? null : unfiltered.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;
      const value = raw[input++];
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < unfiltered.length; i += channels, j += 4) {
    rgba[j] = unfiltered[i];
    rgba[j + 1] = unfiltered[i + 1];
    rgba[j + 2] = unfiltered[i + 2];
    rgba[j + 3] = channels === 4 ? unfiltered[i + 3] : 255;
  }
  return { width, height, rgba };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

async function waitForUrl(url) {
  await waitFor(async () => {
    try {
      const res = await fetch(url);
      return res.ok;
    } catch {
      return false;
    }
  }, `Timed out waiting for ${url}`, 10000);
}

async function openSafari(url) {
  await command("osascript", ["-e", `
    tell application "Safari"
      activate
      if (count of windows) = 0 then make new document with properties {URL:"${url}"}
      set URL of front document to "${url}"
      set bounds of front window to {40, 80, 1500, 980}
    end tell
  `]);
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function waitForReady(route) {
  let lastTitle = "";
  await waitFor(async () => {
    lastTitle = await command("osascript", ["-e", 'tell application "Safari" to return name of front document']);
    return lastTitle.startsWith(`CACHOU_CRM_READY:${route}:`);
  }, `CRM UI did not finish rendering ${route}; last title=${lastTitle}`, 12000);
  return lastTitle;
}

async function assertRouteLayout(route) {
  const script = `
    JSON.stringify((() => {
      const selector = {
        overview: ".overview-grid",
        pipeline: ".pipeline-board",
        "live-room": ".live-room",
        contacts: ".split",
        companies: ".companies",
        security: ".security-grid",
        "performance-lab": ".lab",
        benchmarks: ".claims",
        "collaboration-lab": ".collab"
      }["${route}"]);
      const shell = document.querySelector(".shell");
      const target = document.querySelector(selector);
      const card = document.querySelector(".hero-tile, .metric-card, .login-card, .spotlight, .stage, .chat-panel, .detail");
      const body = document.body.getBoundingClientRect();
      if (!shell || !target || !card) return { ok: false, reason: "missing required surface", route };
      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(card);
      return {
        ok: rect.width > 300 && rect.height > 80 && body.width > 900,
        route,
        width: rect.width,
        height: rect.height,
        radius: style.borderRadius,
        background: style.backgroundColor
      };
    })())
  `;
  let raw;
  try {
    raw = await command("osascript", ["-e", `tell application "Safari" to do JavaScript ${JSON.stringify(script)} in front document`]);
  } catch (err) {
    if (String(err.message || err).includes("Allow JavaScript from Apple Events")) {
      return;
    }
    throw err;
  }
  const result = JSON.parse(raw);
  if (!result.ok) {
    throw new Error(`Visual layout assertion failed: ${JSON.stringify(result)}`);
  }
}

async function waitFor(predicate, message, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(message);
}
