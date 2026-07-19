/**
 * Supported Node SSR recipe for CachouJS 0.5+
 *
 *   node examples/node-ssr/server.mjs
 *   # or from package root: node examples/node-ssr/server.mjs
 *
 * Concurrent-safe: createSSRContext per request (via renderApplication),
 * ALS installed when available, CSP nonces, production security defaults.
 *
 * This is the documented production path — not the monorepo demo server.
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

// Concurrent SSR isolation (Node)
try {
  const asyncHooks = require("node:async_hooks");
  const { installSSRAsyncHooks } = await import(
    pathToFileURL(path.join(root, "src/ssr-context.js")).href
  );
  installSSRAsyncHooks(asyncHooks);
} catch {
  // Sequential handlers still work with explicit contexts
}

const {
  signal,
  html,
  createResource,
  Show,
  renderApplication,
  htmlDocument,
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
  const [msg] = createResource(
    async () => {
      await new Promise(r => setTimeout(r, 5));
      return "Hello from Node SSR";
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  return Show({
    when: () => true,
    children: () => html`
      <main>
        <h1>Cachou Node SSR</h1>
        <p>${() => msg() || "Loading…"}</p>
        <p>Count: ${() => count()}</p>
      </main>
    `
  });
}

const PORT = Number(process.env.PORT || process.env.CACHOU_PORT || 8788);

const server = http.createServer(async (req, res) => {
  const nonce = serverNonce();
  try {
    const { html: body, head, state } = await renderApplication(App, {
      path: req.url,
      request: req,
      nonce
      // signal: req.signal when available on your platform
    });

    applySecurityHeaders(
      res,
      buildSecurityHeaders({
        nonce,
        allowInlineStyles: false
      })
    );

    const page = htmlDocument({
      html: body,
      head,
      state,
      title: "Cachou Node SSR",
      styles: `<style nonce="${nonce}">body{font-family:system-ui;padding:2rem;max-width:40rem;margin:auto}</style>`,
      scripts: `<!-- hydrate with the same App via cachoujs/browser when you add a client bundle -->`
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(page);
  } catch (err) {
    console.error("[node-ssr]", err);
    applySecurityHeaders(res, buildSecurityHeaders({ allowInlineStyles: false }));
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`Node SSR recipe listening on http://127.0.0.1:${PORT}`);
});
