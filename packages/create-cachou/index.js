#!/usr/bin/env node
/**
 * Scaffold: Vite + CachouJS (+ file routes).
 *
 *   npx @cachoujs/create my-app
 *   npx @cachoujs/create my-app --template spa|ssr|static
 *   node packages/create-cachou/index.js my-app --template ssr
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const CACHOU_VERSION = "1.0.11";
const TEMPLATES = new Set(["spa", "ssr", "static"]);

function printHelp() {
  console.log(`Usage: create-cachou <name> [options]

Options:
  --template <spa|ssr|static>   App shape (default: spa)
  -t <spa|ssr|static>           Alias for --template
  --help, -h                    Show this help

Templates:
  spa      Client SPA + file routes (browser history) — default
  static   Client SPA with hash history (zero-rewrite static hosts)
  ssr      SPA client + Node SSR entry (renderApplication recipe)
`);
}

function parseArgs(argv) {
  const args = [...argv];
  let name = null;
  let template = "spa";
  while (args.length) {
    const a = args.shift();
    if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
    if (a === "--template" || a === "-t") {
      template = (args.shift() || "").toLowerCase();
      continue;
    }
    if (a.startsWith("--template=")) {
      template = a.slice("--template=".length).toLowerCase();
      continue;
    }
    if (!a.startsWith("-") && !name) {
      name = a;
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    printHelp();
    process.exit(1);
  }
  return { name: name || "cachou-app", template };
}

const { name: rawName, template } = parseArgs(process.argv.slice(2));

if (!TEMPLATES.has(template)) {
  console.error(`Invalid template "${template}". Use: spa | ssr | static`);
  process.exit(1);
}

const target = resolve(process.cwd(), rawName);
const name = target.split(/[/\\]/).filter(Boolean).pop() || "cachou-app";

if (!/^[a-zA-Z0-9._@-]+$/.test(name)) {
  console.error(`Invalid project name "${name}". Use letters, numbers, ., _, -, or @.`);
  process.exit(1);
}

if (existsSync(target)) {
  console.error(`Directory already exists: ${target}`);
  process.exit(1);
}

const historyMode = template === "static" ? "hash" : "browser";

const packageScripts = {
  dev: "vite",
  build: "vite build",
  preview: "vite preview",
  compile: "cachou-compiler -dir src/components -out src/components -runtime cachoujs"
};
if (template === "ssr") {
  packageScripts["ssr"] = "node server.mjs";
  packageScripts["dev:ssr"] = "node server.mjs";
}
if (template === "static") {
  packageScripts["prerender"] =
    "node --experimental-vm-modules ./scripts/prerender.mjs";
}

const files = {
  "package.json":
    JSON.stringify(
      {
        name,
        private: true,
        version: "0.0.1",
        type: "module",
        scripts: packageScripts,
        dependencies: {
          cachoujs: `^${CACHOU_VERSION}`
        },
        devDependencies: {
          "@cachoujs/compiler": `^${CACHOU_VERSION}`,
          vite: "^6.0.0"
        }
      },
      null,
      2
    ) + "\n",
  "vite.config.js": `import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [cachou({ dirs: ["src/components"], runtime: "cachoujs/browser" })]
});
`,
  "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
  ".gitignore": `node_modules
dist
.DS_Store
*.log
.env
.env.*
`,
  "src/styles.css": `:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --fg: #172033;
  --muted: #5b6578;
  --card: #ffffff;
  --border: #d7dce5;
  --accent: #2563eb;
  --accent-fg: #ffffff;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1419;
    --fg: #e8eef7;
    --muted: #9aa6b8;
    --card: #171d26;
    --border: #2a3342;
    --accent: #3b82f6;
  }
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.shell { max-width: 42rem; margin: 0 auto; padding: 1.5rem; }
.nav {
  display: flex; flex-wrap: wrap; gap: 0.75rem 1rem;
  margin-bottom: 1.25rem; padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}
.card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 1.25rem;
}
.card h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
.card p { margin: 0.5rem 0; color: var(--muted); }
button {
  appearance: none; border: 0; border-radius: 8px;
  background: var(--accent); color: var(--accent-fg);
  font: inherit; padding: 0.5rem 0.9rem; cursor: pointer;
}
button:hover { filter: brightness(1.05); }
pre {
  overflow: auto; background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 0.75rem; font-size: 0.875rem;
}
`,
  "src/main.js": `import * as Cachou from "cachoujs/browser";
import {
  html,
  mount,
  Router,
  Link,
  fileRoutes,
  configureRouter,
  applyProductionSecurityDefaults,
  installDevtoolsHotkey
} from "cachoujs/browser";
import "./styles.css";

applyProductionSecurityDefaults();
configureRouter({ history: "${historyMode}" });

// Expose runtime for the Cachou browser DevTools extension (dev only).
if (import.meta.env.DEV) {
  window.__CACHOU_RUNTIME__ = Cachou;
  installDevtoolsHotkey();
}

const pages = import.meta.glob("./routes/**/*.{js,jsx}");

function App() {
  return html\`
    <div class="shell">
      <nav class="nav" aria-label="Main">
        \${Link({ href: "/", children: "Home" })}
        \${Link({ href: "/about", children: "About" })}
        \${Link({ href: "/users/ada", children: "User ada" })}
      </nav>
      \${Router({ children: fileRoutes(pages) })}
    </div>
  \`;
}

mount(App, document.getElementById("app"));
`,
  "src/routes/index.js": `import { signal, html } from "cachoujs/browser";

export default function Home() {
  const [count, setCount] = signal(0);
  return html\`
    <main class="card">
      <h1>Hello CachouJS</h1>
      <p>Template: <strong>${template}</strong>. Fine-grained reactivity + file-based routes.</p>
      <p style="margin-top:1rem">
        <button type="button" onclick=\${() => setCount(c => c + 1)}>
          Count: \${() => count()}
        </button>
      </p>
    </main>
  \`;
}
`,
  "src/routes/about.js": `import { html } from "cachoujs/browser";

export default function About() {
  return html\`
    <main class="card">
      <h1>About</h1>
      <p>File-based route: <code>src/routes/about.js</code>.</p>
      <p>Optional <code>.cachou</code> components go in <code>src/components/</code>.</p>
    </main>
  \`;
}
`,
  "src/routes/users/[id].js": `import { html, Show } from "cachoujs/browser";

export async function load({ params, signal }) {
  await new Promise(r => setTimeout(r, 80));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return { id: params.id, name: String(params.id).toUpperCase() };
}

export default function UserPage(_params, state) {
  return html\`
    <main class="card">
      <h1>User</h1>
      <p>Route loader demo for <code>/users/:id</code>.</p>
      \${Show({
        when: () => state?.loading?.(),
        children: () => html\`<p>Loading…</p>\`
      })}
      \${Show({
        when: () => state?.data?.(),
        children: data => html\`<pre>\${JSON.stringify(data, null, 2)}</pre>\`
      })}
    </main>
  \`;
}
`
};

// Template-specific extras
if (template === "ssr") {
  files["server.mjs"] = `/**
 * Node SSR entry (supported recipe).
 *   npm run ssr
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import {
  signal,
  html,
  Show,
  renderApplication,
  htmlDocument,
  createCSPNonce,
  buildSecurityHeaders,
  applySecurityHeaders,
  applyProductionSecurityDefaults,
  installSSRAsyncHooks
} from "cachoujs";

applyProductionSecurityDefaults();
try {
  installSSRAsyncHooks(createRequire(import.meta.url)("node:async_hooks"));
} catch {
  // sequential handlers still work with explicit contexts
}

function serverNonce() {
  try {
    return createCSPNonce();
  } catch {
    // createCSPNonce fails closed without Web Crypto; Node always has randomBytes.
    return randomBytes(16).toString("base64url");
  }
}

function App() {
  const [n] = signal(1);
  return Show({
    when: () => true,
    children: () => html\`
      <main class="card" style="font-family:system-ui;padding:2rem;max-width:40rem;margin:auto">
        <h1>${name} (SSR)</h1>
        <p>Rendered with <code>renderApplication</code>. Count: \${() => n()}</p>
        <p><a href="/">Client app</a> after you build assets separately.</p>
      </main>
    \`
  });
}

const PORT = Number(process.env.PORT || 8788);
const server = http.createServer(async (req, res) => {
  const nonce = serverNonce();
  try {
    const { html: body, head, state } = await renderApplication(App, {
      path: req.url,
      request: req,
      nonce
    });
    applySecurityHeaders(res, buildSecurityHeaders({ nonce, allowInlineStyles: false }));
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      htmlDocument({
        html: body,
        head,
        state,
        title: "${name}",
        styles: \`<style nonce="\${nonce}">body{margin:0;background:#f6f7f9}</style>\`
      })
    );
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});
server.listen(PORT, () => {
  console.log(\`SSR listening on http://127.0.0.1:\${PORT}\`);
});
`;
}

if (template === "static") {
  files["public/_redirects"] = `/*    /index.html   200
`;
  files["scripts/prerender.mjs"] = `/**
 * Optional build-time HTML for known routes (requires Node + full cachoujs).
 * Run after \`vite build\` if you want static shells in dist/.
 *
 *   npm run build && npm run prerender
 */
import { prerenderToDir } from "cachoujs/static";
import { html, signal } from "cachoujs";

function Shell() {
  const [n] = signal(1);
  return () => html\`
    <main style="font-family:system-ui;padding:2rem">
      <h1>${name}</h1>
      <p>Static shell. Client hydrates/mounts from the Vite bundle.</p>
      <p>n=\${() => n()}</p>
    </main>
  \`;
}

await prerenderToDir(Shell, {
  routes: ["/", "/about"],
  outDir: "dist",
  title: ({ path }) => \`${name} \${path}\`,
  scripts: '<script type="module" src="/src/main.js"></script>',
  nonce: false
});
console.log("Prerendered / and /about into dist/");
`;
}

const templateBlurb =
  template === "ssr"
    ? "SPA client + **Node SSR** (`npm run ssr`)"
    : template === "static"
      ? "Static-friendly SPA (**hash** history) + optional prerender script"
      : "Client **SPA** + file routes (browser history)";

files["README.md"] = `# ${name}

Vite + **CachouJS ${CACHOU_VERSION}** scaffold — template **\`${template}\`**.

${templateBlurb}

\`\`\`bash
npm install
npm run dev
${template === "ssr" ? "npm run ssr      # Node SSR recipe\n" : ""}${template === "static" ? "npm run build && npm run prerender   # optional static shells\n" : ""}\`\`\`

## Layout

| Path | Role |
|------|------|
| \`src/main.js\` | App shell (\`cachoujs/browser\`), router, DevTools bridge |
| \`src/routes/\` | File-based pages |
| \`src/components/\` | Optional \`.cachou\` SFCs |
${template === "ssr" ? "| `server.mjs` | Node SSR with `renderApplication` |\n" : ""}${template === "static" ? "| `scripts/prerender.mjs` | Optional `cachoujs/static` pre-render |\n| `public/_redirects` | SPA fallback for Netlify/CF Pages |\n" : ""}

## History mode

Configured as **\`${historyMode}\`** via \`configureRouter\`.

## Docs

- [Get Started](https://github.com/loreste/cachou/blob/main/docs/GETTING_STARTED.md)
- [Deploy](https://github.com/loreste/cachou/blob/main/docs/DEPLOY.md)
- [Stability](https://github.com/loreste/cachou/blob/main/docs/STABILITY.md)
`;

mkdirSync(join(target, "src", "routes", "users"), { recursive: true });
mkdirSync(join(target, "src", "components"), { recursive: true });
if (template === "static") {
  mkdirSync(join(target, "public"), { recursive: true });
  mkdirSync(join(target, "scripts"), { recursive: true });
}

for (const [file, content] of Object.entries(files)) {
  const full = join(target, file);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

console.log(`Created ${name}/ (template: ${template})

Next:
  cd ${name}
  npm install
  npm run dev${template === "ssr" ? "\n  npm run ssr" : ""}
`);
