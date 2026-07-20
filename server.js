import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Install ALS for concurrent SSR isolation in production Node.
try {
  const require = createRequire(import.meta.url);
  const asyncHooks = require("node:async_hooks");
  const { installSSRAsyncHooks } = await import("./src/ssr-context.js");
  installSSRAsyncHooks(asyncHooks);
} catch {
  // Non-Node or restricted environments continue with stack-based isolation.
}

import { getTodos, addTodo, updateTodo, deleteTodo } from "./server/db.js";
import { setupWebSocket } from "./server/ws.js";
import { serveFilesApi } from "./server/files.js";
import { denyUnlessDemo, isDemoMode } from "./server/demo-guard.js";
import { resolveSafeAssetPath, resolveSafeExistingAssetPath } from "./server/static-assets.js";
import {
  renderToStringAsync,
  dehydrate,
  getSSRHead,
  createSSRContext,
  createCSPNonce,
  buildSecurityHeaders,
  applySecurityHeaders,
  applyProductionSecurityDefaults
} from "./src/index.js";
import App from "./demo/app.js";

// Safer HTML/URL/style defaults for the production demo server.
applyProductionSecurityDefaults();

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

function collectBody(req, maxSize = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    throw Object.assign(new Error("Invalid JSON in request body"), { statusCode: 400 });
  }
}

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_MAP_MAX = 10_000;

function rateLimit(req, res) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    entry = { start: now, count: 0 };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (rateLimitMap.size > RATE_LIMIT_MAP_MAX) {
    for (const [key, value] of rateLimitMap) {
      if (now - value.start > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(key);
    }
    // Hard cap: drop oldest half if still oversized (memory DoS guard)
    if (rateLimitMap.size > RATE_LIMIT_MAP_MAX) {
      let i = 0;
      for (const key of rateLimitMap.keys()) {
        rateLimitMap.delete(key);
        if (++i >= Math.floor(RATE_LIMIT_MAP_MAX / 2)) break;
      }
    }
  }
  if (entry.count > RATE_LIMIT_MAX) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Retry-After", "60");
    res.end(JSON.stringify({ error: "Too many requests" }));
    return true;
  }
  return false;
}

function setSecurityHeaders(res, { nonce, allowInlineStyles = true } = {}) {
  applySecurityHeaders(
    res,
    buildSecurityHeaders({
      nonce,
      // Demo CSS-in-JS / inline styles still need unsafe-inline for styles.
      // Scripts use the nonce only (no unsafe-inline).
      allowInlineStyles,
      allowInlineScripts: false
    })
  );
}

const PORT = process.env.PORT || process.env.CACHOU_PORT || 5173;
const DIST_ROOT = path.resolve(__dirname, "dist");

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json"
  };
  return mimeTypes[ext] || "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  if (rateLimit(req, res)) return;
  const url = (req.url || "/").split("?")[0].split("#")[0];

  if (url === "/api/files" || url === "/api/files/content") {
    setSecurityHeaders(res);
    if (denyUnlessDemo(res, "Filesystem API")) return;
    await serveFilesApi(req, res);
    return;
  }

  if (url.startsWith("/api/db-query")) {
    setSecurityHeaders(res);
    if (denyUnlessDemo(res, "Database query API")) return;
    res.setHeader("Content-Type", "application/json");
    try {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      const query = parsedUrl.searchParams.get("query");
      const { runQuery } = await import("./server/db.js");
      const list = await runQuery(query);
      res.end(JSON.stringify(list));
    } catch (e) {
      res.statusCode = e.statusCode || 500;
      res.end(JSON.stringify({ error: e.statusCode ? e.message : "Query failed" }));
    }
    return;
  }

  if (url.startsWith("/api/todos")) {
    setSecurityHeaders(res);
    if (denyUnlessDemo(res, "Todos demo API")) return;
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET") {
      try {
        const list = await getTodos();
        res.end(JSON.stringify(list));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Failed to load todos" }));
      }
      return;
    }

    if (req.method === "POST") {
      try {
        const raw = await collectBody(req);
        const { text } = safeJsonParse(raw);
        if (typeof text !== "string" || text.length > 2000) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid todo text" }));
          return;
        }
        const newItem = await addTodo(text);
        res.end(JSON.stringify(newItem));
      } catch (e) {
        res.statusCode = e.statusCode || 400;
        res.end(JSON.stringify({ error: e.statusCode ? e.message : "Bad request" }));
      }
      return;
    }

    if (req.method === "PUT") {
      try {
        const raw = await collectBody(req);
        const body = safeJsonParse(raw);
        const id = Number(body?.id);
        if (!Number.isInteger(id) || id < 1) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid id" }));
          return;
        }
        if (typeof body.completed !== "boolean") {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid completed flag" }));
          return;
        }
        const updatedItem = await updateTodo(id, body.completed);
        res.end(JSON.stringify(updatedItem));
      } catch (e) {
        res.statusCode = e.statusCode || 400;
        res.end(JSON.stringify({ error: e.statusCode ? e.message : "Bad request" }));
      }
      return;
    }

    if (req.method === "DELETE") {
      try {
        const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
        const id = parseInt(parsedUrl.searchParams.get("id"), 10);
        if (Number.isNaN(id)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Invalid id parameter" }));
          return;
        }
        await deleteTodo(id);
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Bad request" }));
      }
      return;
    }
  }

  const isHtmlRequest =
    url === "/" ||
    url === "/demo" ||
    (url.startsWith("/demo") &&
      !url.includes(".js") &&
      !url.includes(".css") &&
      !url.includes(".png") &&
      !url.includes(".webp") &&
      !url.includes(".woff") &&
      !url.includes(".ttf") &&
      !url.includes(".map"));

  if (isHtmlRequest) {
    // Prefer framework nonce helper; fall back to Node crypto if Web Crypto is absent.
    let nonce;
    try {
      nonce = createCSPNonce();
    } catch {
      nonce = crypto.randomBytes(16).toString("base64url");
    }
    setSecurityHeaders(res, { nonce, allowInlineStyles: true });
    try {
      const htmlTemplatePath = path.join(DIST_ROOT, "demo", "index.html");
      if (!fs.existsSync(htmlTemplatePath)) {
        res.statusCode = 404;
        res.end("Production build not found. Please run `npm run build` first.");
        return;
      }

      let template = fs.readFileSync(htmlTemplatePath, "utf-8");

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        if (typeof input === "string" && input.startsWith("/")) {
          input = `http://localhost:${PORT}` + input;
        }
        return originalFetch(input, init);
      };

      try {
        // Per-request SSR context — safe under concurrent connections.
        const context = createSSRContext();
        const appHtml = await renderToStringAsync(App, {
          path: req.url,
          request: req,
          context
        });
        const stateScript = dehydrate(context, { nonce });
        const headHtml = getSSRHead(context);
        const html = template
          .replace('<div id="app"></div>', `<div id="app">${appHtml}</div>`)
          .replace("</head>", `${stateScript}\n${headHtml}</head>`);

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
        return;
      } finally {
        globalThis.fetch = originalFetch;
      }
    } catch (e) {
      console.error("⚡ Production SSR Error:", e);
      res.statusCode = 500;
      res.end("Internal Server Error");
      return;
    }
  }

  setSecurityHeaders(res);
  const assetPath = resolveSafeAssetPath(DIST_ROOT, url);
  if (assetPath) {
    let finalPath = assetPath;
    try {
      if (fs.existsSync(finalPath) && fs.statSync(finalPath).isDirectory()) {
        const indexPath = path.join(finalPath, "index.html");
        const indexRel = path.relative(DIST_ROOT, indexPath);
        if (!indexRel.startsWith("..") && !path.isAbsolute(indexRel) && fs.existsSync(indexPath)) {
          finalPath = indexPath;
        } else {
          finalPath = null;
        }
      }
    } catch {
      finalPath = null;
    }

    const safeFinalPath = finalPath && resolveSafeExistingAssetPath(DIST_ROOT, finalPath);
    if (safeFinalPath) {
      let assetFd = null;
      try {
        assetFd = fs.openSync(
          safeFinalPath,
          fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)
        );
        if (!fs.fstatSync(assetFd).isFile()) {
          fs.closeSync(assetFd);
          assetFd = null;
        } else {
          const base = path.basename(safeFinalPath).toLowerCase();
          if (base === ".env" || base.endsWith(".pem") || base.endsWith(".key")) {
            fs.closeSync(assetFd);
            assetFd = null;
            res.statusCode = 404;
            res.end("Not Found");
            return;
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", getMimeType(safeFinalPath));
          const stream = fs.createReadStream(null, { fd: assetFd, autoClose: true });
          assetFd = null;
          stream.on("error", () => {
            if (res.headersSent) res.destroy();
            else {
              res.statusCode = 404;
              res.end("Not Found");
            }
          });
          stream.pipe(res);
          return;
        }
      } catch {
        if (assetFd !== null) {
          try {
            fs.closeSync(assetFd);
          } catch {
            // ignore close failures during a rejected asset read
          }
        }
      }
    }
  }

  res.statusCode = 404;
  res.end("Not Found");
});

setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`⚡ [CachouJS Server] Production server listening at http://localhost:${PORT}`);
  console.log(`⚡ [CachouJS Server] Demo APIs: ${isDemoMode() ? "ENABLED (CACHOU_DEMO)" : "disabled"}`);
});
