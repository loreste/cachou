#!/usr/bin/env node
/**
 * Scaffold: Vite + CachouJS (+ optional file routes).
 * Usage: npx @cachoujs/create my-app
 *        node packages/create-cachou/index.js my-app
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const name = process.argv[2] || "cachou-app";
const target = resolve(process.cwd(), name);

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
          cachoujs: "^0.3.0"
        },
        devDependencies: {
          "@cachoujs/compiler": "^0.3.0",
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
  "src/main.js": `import * as Cachou from "cachoujs";
import { signal, html, mount, Router, Link, fileRoutes, installDevtoolsHotkey } from "cachoujs";

// Expose runtime for the Cachou browser DevTools extension (dev only)
if (import.meta.env.DEV) {
  window.__CACHOU_RUNTIME__ = Cachou;
  installDevtoolsHotkey();
}

const pages = import.meta.glob("./routes/**/*.{js,jsx}");

function App() {
  return html\`
    <div style="font-family: system-ui; padding: 1.5rem; max-width: 40rem; margin: auto">
      <nav style="display:flex; gap: 0.75rem; margin-bottom: 1rem">
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
    <main>
      <h1>Hello CachouJS</h1>
      <button type="button" onclick=\${() => setCount(c => c + 1)}>
        Count: \${() => count()}
      </button>
    </main>
  \`;
}
`,
  "src/routes/about.js": `import { html } from "cachoujs";

export default function About() {
  return html\`<main><h1>About</h1><p>File-based route: routes/about.js</p></main>\`;
}
`,
  "src/routes/users/[id].js": `import { html, Show } from "cachoujs";

export async function load({ params, signal }) {
  await new Promise(r => setTimeout(r, 80));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return { id: params.id, name: String(params.id).toUpperCase() };
}

export default function UserPage(params, state) {
  return html\`
    <main>
      <h1>User</h1>
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

CachouJS + Vite scaffold with **file-based routes** under \`src/routes/\`.

\`\`\`bash
npm install
npm run dev
\`\`\`

- Routes: \`src/routes/**\`
- Optional \`.cachou\` components: \`src/components/\` + \`npm run compile\`
- DevTools: set \`window.__CACHOU_RUNTIME__\` (already in \`main.js\`) and load the browser extension from the monorepo, or press Ctrl+Shift+D
`
};

for (const [file, content] of Object.entries(files)) {
  const full = join(target, file);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

// Keep root create-cachou in sync path for monorepo users
console.log(`Created ${name}/

Next:
  cd ${name}
  npm install
  npm run dev
`);
