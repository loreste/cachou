# Content site build sketch

Load markdown collections, write a JSON manifest, map entries to routes, and
optionally pre-render HTML.

## Run

```bash
node examples/content-site/build.mjs
# → examples/content-site/out/content.json
# → examples/content-site/out/blog/index.html
# → examples/content-site/out/blog/<slug>/index.html
```

## APIs used

| Module | API |
|--------|-----|
| `cachoujs/content` | `buildContent`, `routesFromCollection`, `exportContentManifest` |
| `cachoujs/static` | `prerenderToDir` |
| `cachoujs/image` | `buildSrcSet` (CDN URL patterns — no image binary pipeline) |

See [Build content and images](../../docs/how-to/build-content-and-images.md).
