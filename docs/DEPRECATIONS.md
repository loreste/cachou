# Deprecations (1.x)

APIs still work in **1.x** with console warnings. Prefer the replacements now.
Removal is reserved for a **future major** (not 1.0.0 — upgrade from 0.6 stays easy).

| Deprecated | Replacement | Notes |
|------------|-------------|--------|
| `addMiddleware(fn)` | `guard(fn)` | Same signature (`to`, `from`, `next`, `signal`) |
| `useApp()` | `getApp()` | Plugin system |
| `createApp()` | `launch()` | Plugin system (alias kept in 1.x) |

## Not deprecated — but experimental

These stay available but may change in **patch** releases under 1.x. Pin tightly:

- Subpath kits: `cachoujs/ui`, `auth`, `i18n`, `dnd`, `seo`, `upload`, `feedback`, …
- `dbSignal`, `webSocketSignal` (demo-oriented)
- DevTools panel / browser extension
- Content collections build helpers
- Fetch SSR adapters / static pre-render (candidate; safer than experimental kits)

## Policy

1. Deprecated APIs log a console warning where practical.
2. Removals happen only on a **major** after 1.0, listed here first.
3. See [STABILITY.md](./STABILITY.md) and [ONE_POINT_OH.md](./ONE_POINT_OH.md).
4. Introspection: `getExportStability(name)`.

## 1.0 freeze checklist

| Criterion | Status |
|-----------|--------|
| Core labeled **stable** | Done |
| Experimental clearly documented | Done |
| Install SPA/SSR from published packages | Done |
| Changelog + version policy | Done |
| `npm run check` green; security residual documented | Done |
| Deprecated APIs listed | **This file** |
| `npm run freeze:check` | Done (1.0.0) |

Related: [ONE_POINT_OH.md](./ONE_POINT_OH.md) · [Roadmap](./ROADMAP.md) · [Publishing](./PUBLISHING.md)
