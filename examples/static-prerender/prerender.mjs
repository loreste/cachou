/**
 * Build-time static HTML for a few routes.
 *
 *   node examples/static-prerender/prerender.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(__dirname, "out");

const { html, signal, Show } = await import(
  pathToFileURL(path.join(root, "src/index.js")).href
);
const { prerenderToDir } = await import(
  pathToFileURL(path.join(root, "src/static.js")).href
);

function App() {
  const [n] = signal(1);
  return Show({
    when: () => true,
    children: () => html`
      <main>
        <h1>Cachou static pre-render</h1>
        <p>Generated at build time. Count: ${() => n()}</p>
        <nav>
          <a href="/">Home</a>
          <a href="/about/">About</a>
        </nav>
      </main>
    `
  });
}

const { written } = await prerenderToDir(App, {
  routes: [
    { path: "/", title: "Home — Cachou static" },
    { path: "/about", title: "About — Cachou static" }
  ],
  outDir,
  styles:
    "<style>body{font-family:system-ui;padding:2rem;max-width:40rem;margin:auto}nav a{margin-right:1rem}</style>",
  scripts: "<!-- add client hydrate bundle here if needed -->",
  nonce: false
});

console.log(`Wrote ${written.length} page(s) to ${outDir}`);
for (const w of written) {
  console.log(`  ${w.file} (${w.bytes} bytes)`);
}
