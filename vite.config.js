import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { cachou } from "./plugin/vite.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Enable ALS-backed SSR isolation when Vite SSR runs on Node.
try {
  const asyncHooks = require("node:async_hooks");
  const { installSSRAsyncHooks } = await import("./src/ssr-context.js");
  installSSRAsyncHooks(asyncHooks);
} catch {
  // ignore
}

if (!process.env.CACHOU_DEMO && process.env.NODE_ENV !== "production") {
  process.env.CACHOU_DEMO = "1";
}

const PORT = process.env.PORT || process.env.CACHOU_PORT || 5173;
const BACKEND_URL = process.env.CACHOU_BACKEND_URL;

function demoApiPlugin() {
  return {
    name: "cachou-demo-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url.startsWith("/__cachou_compare_results__")) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method not allowed");
            return;
          }
          let body = "";
          req.on("data", chunk => (body += chunk));
          req.on("end", () => {
            const resultsPath =
              process.env.CACHOU_COMPARE_RESULTS_PATH || path.join(os.tmpdir(), "cachou-compare-results.json");
            fs.writeFileSync(resultsPath, body);
            res.statusCode = 204;
            res.end();
          });
          return;
        }

        const { denyUnlessDemo } = await import("./server/demo-guard.js");

        if (req.url.startsWith("/api/files")) {
          if (denyUnlessDemo(res, "Filesystem API")) return;
          const { serveFilesApi } = await import("./server/files.js");
          const handled = await serveFilesApi(req, res);
          if (handled) return;
        }

        if (req.url.startsWith("/api/db-query")) {
          if (denyUnlessDemo(res, "Database query API")) return;
          res.setHeader("Content-Type", "application/json");
          try {
            const parsedUrl = new URL(req.url, "http://localhost");
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

        if (req.url.startsWith("/api/todos")) {
          if (denyUnlessDemo(res, "Todos demo API")) return;
          const { getTodos, addTodo, updateTodo, deleteTodo } = await import("./server/db.js");
          res.setHeader("Content-Type", "application/json");

          if (req.method === "GET") {
            const list = await getTodos();
            res.end(JSON.stringify(list));
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", chunk => (body += chunk));
            req.on("end", async () => {
              try {
                const { text } = JSON.parse(body);
                const newItem = await addTodo(text);
                res.end(JSON.stringify(newItem));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          if (req.method === "PUT") {
            let body = "";
            req.on("data", chunk => (body += chunk));
            req.on("end", async () => {
              try {
                const { id, completed } = JSON.parse(body);
                const updatedItem = await updateTodo(id, completed);
                res.end(JSON.stringify(updatedItem));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          if (req.method === "DELETE") {
            try {
              const url = new URL(req.url, "http://localhost");
              const id = parseInt(url.searchParams.get("id"), 10);
              await deleteTodo(id);
              res.end(JSON.stringify({ success: true }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
            return;
          }
        }
        next();
      });

      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split("?")[0].split("#")[0];
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
          const host = server.config.server.host || "localhost";
          const port = server.config.server.port || 5173;
          const baseAddr = `http://${host}:${port}`;
          const originalFetch = globalThis.fetch;

          globalThis.fetch = async (input, init) => {
            if (typeof input === "string" && input.startsWith("/")) {
              input = baseAddr + input;
            }
            return originalFetch(input, init);
          };

          try {
            const htmlPath = path.resolve(process.cwd(), "demo", "index.html");
            let template = fs.readFileSync(htmlPath, "utf-8");
            template = await server.transformIndexHtml(req.url, template);

            const { renderToStringAsync, dehydrate, getSSRHead } = await server.ssrLoadModule("/src/index.js");
            const App = (await server.ssrLoadModule("/demo/app.js")).default;

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
          } catch (e) {
            console.error("⚡ [CachouJS SSR Middleware Error]:", e.message);
          } finally {
            globalThis.fetch = originalFetch;
          }
        }
        next();
      });

      if (server.httpServer) {
        import("./server/ws.js").then(({ setupWebSocket }) => {
          setupWebSocket(server.httpServer);
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    cachou({
      dirs: ["demo/components", "crm/src/components", "examples"],
      runtime: "cachoujs"
    }),
    demoApiPlugin()
  ],
  resolve: {
    alias: {
      cachoujs: path.resolve(__dirname, "src/index.js")
    }
  },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
  },
  optimizeDeps: {
    exclude: ["pg", "mongodb", "mysql2/promise", "firebase-admin", "sharp"]
  },
  ssr: {
    external: ["pg", "mongodb", "mysql2/promise", "firebase-admin", "sharp"]
  },
  server: {
    port: Number(PORT),
    host: true,
    ...(BACKEND_URL
      ? {
          proxy: {
            "/api": {
              target: BACKEND_URL,
              changeOrigin: true
            },
            "/ws-api": {
              target: BACKEND_URL,
              changeOrigin: true,
              ws: true
            }
          }
        }
      : {})
  },
  build: {
    rollupOptions: {
      // Node-only optional peers — never bundle into browser demos/tests.
      external: [
        "firebase-admin",
        "mongodb",
        "mysql2/promise",
        "pg",
        "sharp",
        /^node:/
      ],
      input: {
        demo: path.resolve(__dirname, "demo", "index.html"),
        tests: path.resolve(__dirname, "tests", "index.html"),
        benchmarks: path.resolve(__dirname, "benchmarks", "index.html"),
        compare: path.resolve(__dirname, "benchmarks", "compare", "index.html"),
        examples: path.resolve(__dirname, "examples", "index.html")
      }
    }
  }
});
