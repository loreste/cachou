# Build content collections and responsive images

**Status:** experimental (content / image kits) · build helpers added in **0.6.3**

Related: [CONTENT.md](../CONTENT.md) · [IMAGE.md](../IMAGE.md) · [static pre-render](./deploy-static-prerender.md) · example [`examples/content-site/`](../../examples/content-site/)

---

## Content build pipeline

### One-shot load → manifest → routes

```js
import { z, buildContent } from "cachoujs/content";
// or: import { buildContent, z } from "cachoujs";

const { manifest, written, routes } = await buildContent(
  [
    {
      name: "posts",
      directory: "./content/posts",
      schema: z.object({
        title: z.string(),
        date: z.optional(z.date()),
        tags: z.optional(z.array(z.string()))
      })
    }
  ],
  {
    outPath: "dist/content.json",
    routeCollections: [
      {
        name: "posts",
        prefix: "/blog",
        includeIndex: true,
        indexTitle: "Blog",
        title: entry => entry.data.title
      }
    ]
  }
);

// routes → feed into prerenderRoutes / prerenderToDir from cachoujs/static
```

### Pieces

| API | Role |
|-----|------|
| `loadContent(configs)` | Read `.md` / `.json` from disk into registries |
| `exportContentManifest(names?)` | JSON-safe snapshot (Dates → ISO) |
| `writeContentManifest(path)` | Write manifest for client fetch / import |
| `routesFromCollection(name, opts)` | `{ path, title, slug, entry }[]` for SSG |
| `buildContent(configs, opts)` | All of the above |

Client apps can `fetch("/content.json")` then `addEntries("posts", manifest.collections.posts)`.

---

## Responsive images (no binary pipeline)

Cachou does **not** ship sharp/libvips. Use your CDN or external optimizer; these helpers only format attributes:

```js
import { buildSrcSet, buildSizes, responsiveImageProps, Image } from "cachoujs/image";

const srcset = buildSrcSet("https://cdn.example/photo-{w}.webp", [480, 800, 1200]);
const sizes = buildSizes([
  { max: 600, size: "100vw" },
  { size: "50vw" }
]);

// or
Image(
  responsiveImageProps({
    src: "https://cdn.example/photo-{w}.webp",
    widths: [480, 800, 1200],
    alt: "Product",
    sizes: [{ max: 600, size: "100vw" }, { size: "50vw" }]
  })
);
```

| API | Output |
|-----|--------|
| `buildSrcSet(source, widths)` | `url 400w, url 800w, …` |
| `buildSizes(rules)` | `(max-width: 600px) 100vw, 50vw` |
| `responsiveImageProps(opts)` | `{ src, srcset, sizes, … }` for `Image` |
| `resolveAspectRatio(ratio, w, h)` | Fill missing dimension |

`quality` on `Image` remains a **hint** (`data-quality`) for external build tools.

---

## Limits

- Frontmatter parser is intentionally simple (not full YAML).
- No filesystem watching / HMR for content — re-run the build script.
- Image helpers never download or resize files.
