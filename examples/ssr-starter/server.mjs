/**
 * Minimal Node SSR starter for CachouJS (hardened defaults).
 *
 *   node examples/ssr-starter/server.mjs
 *
 * Demo APIs are intentionally disabled. Add real auth on your own APIs.
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

// Concurrent SSR isolation
try {
  const asyncHooks = require("node:async_hooks");
  const { installSSRAsyncHooks } = await import(
    pathToFileURL(path.join(root, "src/ssr-context.js")).href
  );
  installSSRAsyncHooks(asyncHooks);
} catch {
  // optional
}

const {
  createSSRContext,
  renderToStringAsync,
  dehydrate,
  getSSRHead,
  signal,
  html,
  createResource,
  Show,
  createCSPNonce,
  buildSecurityHeaders,
  applySecurityHeaders,
  applyProductionSecurityDefaults
} = await import(pathToFileURL(path.join(root, "src/index.js")).href);

applyProductionSecurityDefaults();

function serverNonce() {
  try {
    return createCSPNonce();
  } catch {
    return randomBytes(16).toString("base64url");
  }
}

function App() {
  const [count] = signal(1);
  const [msg] = createResource(async () => {
    await new Promise(r => setTimeout(r, 10));
    return "Hello from SSR";
  });

  return html`
    <main>
      <h1>Cachou SSR starter</h1>
      <p>${() => msg() || "Loading…"}</p>
      ${Show({
        when: () => count() > 0,
        children: () => html`<p>Count signal: ${() => count()}</p>`
      })}
      <p><a href="/">Home</a></p>
    </main>
  `;
}

const PORT = Number(process.env.PORT || process.env.CACHOU_PORT || 8787);

const server = http.createServer(async (req, res) => {
  const context = createSSRContext();
  const nonce = serverNonce();
  try {
    const appHtml = await renderToStringAsync(App, {
      path: req.url,
      request: req,
      context
    });
    const state = dehydrate(context, { nonce });
    const head = getSSRHead(context);

    applySecurityHeaders(
      res,
      buildSecurityHeaders({
        nonce,
        // One nonced style block below — no blanket unsafe-inline for scripts.
        allowInlineStyles: false
      })
    );

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cachou SSR Starter</title>
  ${head}
  ${state}
  <style nonce="${nonce}">body{font-family:system-ui;padding:2rem;max-width:40rem;margin:auto} .muted{color:#666;font-size:14px}</style>
</head>
<body>
  <div id="app">${appHtml}</div>
  <p class="muted">Server-rendered only. Hydrate by mounting the same App client-side.</p>
</body>
</html>`);
  } catch (err) {
    console.error("SSR starter error:", err);
    applySecurityHeaders(res, buildSecurityHeaders({ allowInlineStyles: false }));
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`SSR starter listening on http://127.0.0.1:${PORT}`);
});
