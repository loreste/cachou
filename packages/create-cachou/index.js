#!/usr/bin/env node
/**
 * Scaffold: Vite + CachouJS (+ file routes).
 * Usage: npx @cachoujs/create my-app
 *        node packages/create-cachou/index.js my-app
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const rawName = process.argv[2] || "cachou-app";
// Accept a simple folder name (preferred) or an absolute/relative path.
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

mkdirSync(join(target, "src", "routes"), { recursive: true });
mkdirSync(join(target, "src", "components"), { recursive: true });

const files = {
  "package.json":
    JSON.stringify(
      {
        name,
        private: true,
        version: "0.0.1",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
          compile: "cachou-compiler -dir src/components -out src/components -runtime cachoujs"
        },
        dependencies: {
          cachoujs: "^0.4.1"
        },
        devDependencies: {
          "@cachoujs/compiler": "^0.4.1",
          vite: "^6.0.0"
        }
      },
      null,
      2
    ) + "\n",
  "vite.config.js": `import { defineConfig } from "vite";
import { cachou } from "cachoujs/vite";

export default defineConfig({
  plugins: [cachou({ dirs: ["src/components"], runtime: "cachoujs" })]
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

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
}

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.shell {
  max-width: 42rem;
  margin: 0 auto;
  padding: 1.5rem;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
}

.card h1 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
}

.card p {
  margin: 0.5rem 0;
  color: var(--muted);
}

button {
  appearance: none;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  padding: 0.5rem 0.9rem;
  cursor: pointer;
}

button:hover {
  filter: brightness(1.05);
}

pre {
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem;
  font-size: 0.875rem;
}
`,
  "src/main.js": `import * as Cachou from "cachoujs";
import {
  html,
  mount,
  Router,
  Link,
  fileRoutes,
  installDevtoolsHotkey
} from "cachoujs";
import "./styles.css";

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
  "src/routes/index.js": `import { signal, html } from "cachoujs";

export default function Home() {
  const [count, setCount] = signal(0);
  return html\`
    <main class="card">
      <h1>Hello CachouJS</h1>
      <p>Fine-grained reactivity + file-based routes. Edit <code>src/routes/</code> to add pages.</p>
      <p style="margin-top:1rem">
        <button type="button" onclick=\${() => setCount(c => c + 1)}>
          Count: \${() => count()}
        </button>
      </p>
    </main>
  \`;
}
`,
  "src/routes/about.js": `import { html } from "cachoujs";

export default function About() {
  return html\`
    <main class="card">
      <h1>About</h1>
      <p>This page is a file-based route: <code>src/routes/about.js</code>.</p>
      <p>Optional <code>.cachou</code> components go in <code>src/components/</code>.</p>
    </main>
  \`;
}
`,
  "src/routes/users/[id].js": `import { html, Show } from "cachoujs";

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
`,
  "README.md": `# ${name}

Vite + **CachouJS 0.4** scaffold with file-based routes.

\`\`\`bash
npm install
npm run dev
\`\`\`

## Layout

| Path | Role |
|------|------|
| \`src/main.js\` | App shell, router, DevTools bridge |
| \`src/routes/\` | File-based pages (\`/\`, \`/about\`, \`/users/:id\`) |
| \`src/components/\` | Optional \`.cachou\` SFCs |
| \`src/styles.css\` | Base styles |

## Scripts

| Command | What it does |
|---------|----------------|
| \`npm run dev\` | Vite dev server |
| \`npm run build\` | Production build |
| \`npm run preview\` | Preview build |
| \`npm run compile\` | Compile \`.cachou\` components |

## Next steps

- [Get Started](https://github.com/loreste/cachou/blob/main/docs/GETTING_STARTED.md)
- [0.4 framework APIs](https://github.com/loreste/cachou/blob/main/docs/how-to/use-0.4-framework-apis.md)
- DevTools: \`Ctrl+Shift+D\` in dev, or load the monorepo browser extension
`
};

for (const [file, content] of Object.entries(files)) {
  const full = join(target, file);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

console.log(`Created ${name}/

Next:
  cd ${name}
  npm install
  npm run dev
`);
