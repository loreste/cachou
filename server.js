import http from "http";
import fs from "fs";
import path from "path";
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
import { renderToStringAsync, dehydrate, getSSRHead } from "./src/index.js";
import App from "./demo/app.js";

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

function rateLimit(req, res) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    entry = { start: now, count: 0 };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Too many requests" }));
    return true;
  }
  return false;
}

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

const PORT = process.env.PORT || process.env.CACHOU_PORT || 5173;

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
    ".ttf": "font/ttf"
  };
  return mimeTypes[ext] || "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  if (rateLimit(req, res)) return;
  setSecurityHeaders(res);
  const url = req.url.split("?")[0].split("#")[0];

  if (url === "/api/files" || url === "/api/files/content") {
    if (denyUnlessDemo(res, "Filesystem API")) return;
    await serveFilesApi(req, res);
    return;
  }

  if (url.startsWith("/api/db-query")) {
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
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url.startsWith("/api/todos")) {
    if (denyUnlessDemo(res, "Todos demo API")) return;
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET") {
      try {
        const list = await getTodos();
        res.end(JSON.stringify(list));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.method === "POST") {
      try {
        const raw = await collectBody(req);
        const { text } = safeJsonParse(raw);
        const newItem = await addTodo(text);
        res.end(JSON.stringify(newItem));
      } catch (e) {
        res.statusCode = e.statusCode || 400;
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === "PUT") {
      try {
        const raw = await collectBody(req);
        const { id, completed } = safeJsonParse(raw);
        const updatedItem = await updateTodo(id, completed);
        res.end(JSON.stringify(updatedItem));
      } catch (e) {
        res.statusCode = e.statusCode || 400;
        res.end(JSON.stringify({ error: e.message }));
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
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
  }

  const relativeAssetPath = url.startsWith("/demo") ? url.slice(5) : url;
  let assetPath = path.join(__dirname, "dist", relativeAssetPath);

  if (fs.existsSync(assetPath) && fs.statSync(assetPath).isDirectory()) {
    assetPath = path.join(assetPath, "index.html");
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
      !url.includes(".ttf"));

  if (isHtmlRequest) {
    try {
      const htmlTemplatePath = path.join(__dirname, "dist", "demo", "index.html");
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
        const appHtml = await renderToStringAsync(App, { path: req.url });
        const stateScript = dehydrate();
        const headHtml = getSSRHead();
        const html = template
          .replace('<div id="app"></div>', `<div id="app">${appHtml}</div>`)
          .replace("</head>", `${stateScript}\n${headHtml}</head>`);

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end(html);
        return;
      } finally {
        globalThis.fetch = originalFetch;
      }
    } catch (e) {
      res.statusCode = 500;
      res.end(`⚡ Production SSR Error: ${e.message}`);
      return;
    }
  }

  if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
    res.statusCode = 200;
    res.setHeader("Content-Type", getMimeType(assetPath));
    fs.createReadStream(assetPath).pipe(res);
    return;
  }

  res.statusCode = 404;
  res.end("Not Found");
});

setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`⚡ [CachouJS Server] Production server listening at http://localhost:${PORT}`);
  console.log(`⚡ [CachouJS Server] Demo APIs: ${isDemoMode() ? "ENABLED (CACHOU_DEMO)" : "disabled"}`);
});
