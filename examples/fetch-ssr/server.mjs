/**
 * Local smoke test for cachoujs/ssr-adapters (Fetch API shape).
 * Bridges Node http → Request/Response so you can hit the adapter without Workers/Deno.
 *
 *   node examples/fetch-ssr/server.mjs
 */
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const { html, signal, Show } = await import(
  pathToFileURL(path.join(root, "src/index.js")).href
);
const { createFetchHandler } = await import(
  pathToFileURL(path.join(root, "src/ssr-adapters.js")).href
);

function App() {
  const [n] = signal(1);
  return Show({
    when: () => true,
    children: () => html`
      <main>
        <h1>Cachou Fetch SSR</h1>
        <p>Works on Workers, Deno, Bun — this Node bridge is for local smoke only.</p>
        <p>Count: ${() => n()}</p>
      </main>
    `
  });
}

const fetchHandler = createFetchHandler(App, {
  title: "Cachou Fetch SSR",
  styles:
    '<style>body{font-family:system-ui;padding:2rem;max-width:40rem;margin:auto}</style>'
});

const PORT = Number(process.env.PORT || process.env.CACHOU_PORT || 8789);

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${PORT}`;
    const url = `http://${host}${req.url || "/"}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v == null) continue;
      if (Array.isArray(v)) v.forEach(item => headers.append(k, item));
      else headers.set(k, v);
    }
    const request = new Request(url, {
      method: req.method,
      headers
    });
    const response = await fetchHandler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error("[fetch-ssr]", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`Fetch SSR smoke on http://127.0.0.1:${PORT}`);
});
