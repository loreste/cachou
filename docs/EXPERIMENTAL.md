# Experimental surface (0.5+)

These modules are **usable** but **not** part of the stable production contract.
APIs may change in **patch** releases — pin `cachoujs` tightly if you depend on them.

Full labels: [STABILITY.md](./STABILITY.md) · introspection: `getExportStability(name)`.

## Subpath modules

| Import | Status | Notes |
|--------|--------|-------|
| `cachoujs/ui` | experimental | Toast, Drawer, Menu, DataTable, … |
| `cachoujs/auth` | experimental | Client token helpers — your backend owns real auth |
| `cachoujs/i18n` | experimental | Lightweight locale/formatting |
| `cachoujs/dnd` | experimental | Drag/drop primitives |
| `cachoujs/seo` | experimental | Sitemap/robots/OG helpers |
| `cachoujs/upload` | experimental | Upload + DropZone |
| `cachoujs/feedback` | experimental | Progress, Skeleton, CSV |
| `cachoujs/validate` | experimental | Form validators |
| `cachoujs/mask` | experimental | Input masks |
| `cachoujs/machine` | experimental | State machine |
| `cachoujs/keys` | experimental | Hotkeys |
| `cachoujs/utils` | experimental | debounce, media hooks, … |
| `cachoujs/content` | experimental | Node-oriented collections (not in browser entry) |
| `cachoujs/media` | experimental | Compress/helpers (not in browser entry) |
| `cachoujs/image` | experimental | Image/Picture/Video helpers |
| `cachoujs/plugin` | experimental | `createApp` / `launch` |
| `cachoujs/test-utils` | experimental | Test harness helpers |
| `cachoujs/devtools` | experimental | In-page panel |

## Prefer stable core

```js
import { signal, html, mount, createResource, Router, Route } from "cachoujs/browser";
// or full entry on the server:
import { renderApplication, htmlDocument } from "cachoujs";
```

App kits:

```js
import { createAuth } from "cachoujs/auth"; // experimental
import { createToast } from "cachoujs/ui";  // experimental
```

## Demo / CRM

The monorepo **demo server**, **CRM app**, and **DB adapters** are proving grounds only.
They are **not** published as product surface and are not covered by stability labels.
