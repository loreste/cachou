/**
 * Content + static HTML build sketch.
 *
 *   node examples/content-site/build.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const {
  z,
  buildContent,
  html,
  Show,
  buildSrcSet
} = await import(pathToFileURL(path.join(root, "src/index.js")).href);
const { prerenderToDir } = await import(
  pathToFileURL(path.join(root, "src/static.js")).href
);

const contentDir = path.join(__dirname, "content/posts");
const outDir = path.join(__dirname, "out");
const manifestPath = path.join(outDir, "content.json");

const { manifest, written, routes } = await buildContent(
  [
    {
      name: "posts",
      directory: contentDir,
      schema: z.object({
        title: z.string(),
        date: z.optional(z.date()),
        tags: z.optional(z.array(z.string()))
      })
    }
  ],
  {
    outPath: manifestPath,
    routeCollections: [
      {
        name: "posts",
        prefix: "/blog",
        includeIndex: true,
        indexTitle: "Blog",
        title: e => e.data.title
      }
    ]
  }
);

console.log(
  `Manifest: ${written.entryCount} entries → ${written.path} (${written.bytes} bytes)`
);
console.log(`Routes: ${routes.map(r => r.path).join(", ")}`);

// Sample responsive image URL (CDN pattern — no resize pipeline in core)
const heroSrcset = buildSrcSet("/images/hero-{w}.webp", [480, 800, 1200]);

function createApp(page) {
  return function App() {
    return Show({
      when: () => true,
      children: () => {
        if (page.kind === "index") {
          return html`
            <main>
              <h1>Blog</h1>
              <ul>
                ${page.posts.map(
                  p => html`<li><a href=${`/blog/${p.slug}/`}>${p.data.title}</a></li>`
                )}
              </ul>
              <img src="/images/hero-800.webp" srcset=${heroSrcset} sizes="100vw" alt="Hero" />
            </main>
          `;
        }
        return html`
          <main>
            <article>
              <h1>${page.post.data.title}</h1>
              <pre>${page.post.body}</pre>
              <p><a href="/blog/">← Blog</a></p>
            </article>
          </main>
        `;
      }
    });
  };
}

const posts = manifest.collections.posts;
const prerenderRoutes = [];

for (const route of routes) {
  if (route.path === "/blog" || route.path === "/blog/") {
    prerenderRoutes.push({
      path: "/blog",
      title: "Blog",
      component: createApp({ kind: "index", posts })
    });
  } else if (route.slug) {
    const post = posts.find(p => p.slug === route.slug);
    if (!post) continue;
    prerenderRoutes.push({
      path: route.path,
      title: route.title || post.data.title,
      component: createApp({ kind: "post", post })
    });
  }
}

// prerenderToDir expects one Component — render each route with its own component
for (const r of prerenderRoutes) {
  await prerenderToDir(r.component, {
    routes: [{ path: r.path, title: r.title }],
    outDir,
    styles:
      "<style>body{font-family:system-ui;padding:2rem;max-width:40rem;margin:auto}pre{white-space:pre-wrap}</style>",
    nonce: false
  });
  console.log(`  wrote ${r.path}`);
}

console.log(`Done → ${outDir}`);
