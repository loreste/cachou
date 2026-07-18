# Deprecations (toward 1.0)

APIs still work but will be **removed at 1.0**. Prefer the replacements now.

| Deprecated | Replacement | Notes |
|------------|-------------|--------|
| `addMiddleware(fn)` | `guard(fn)` | Same signature (`to`, `from`, `next`, `signal`) |
| `useApp()` | `getApp()` | Plugin system |
| `createApp()` | `launch()` | Plugin system (createApp remains as alias until 1.0) |

## Not deprecated — but experimental

These stay available but may change in **patch** releases before 1.0. Pin tightly:

- Subpath kits: `cachoujs/ui`, `auth`, `i18n`, `dnd`, `seo`, `upload`, `feedback`, …
- `dbSignal`, `webSocketSignal` (demo-oriented)
- DevTools panel / browser extension
- Content collections build helpers
- Fetch SSR adapters / static pre-render (candidate; safer than experimental kits)

## Policy

1. Deprecated APIs log a **one-time console warning** where practical.
2. Removals happen only on **1.0.0** (or a later major), listed here first.
3. See [STABILITY.md](./STABILITY.md) for stable / candidate / experimental labels.
4. Introspection: `getExportStability(name)`.

## 1.0 freeze checklist (progress)

| Criterion | Status |
|-----------|--------|
| Core reactivity, templates, router, resources, SSR, forms labeled **stable** | Done (see `src/stability.js`) |
| Experimental modules clearly documented | Done ([EXPERIMENTAL.md](./EXPERIMENTAL.md)) |
| Install + SPA + SSR from published packages alone | Done (0.6.4 templates + consumer-surface tests) |
| Changelog + version policy | Done |
| `npm run check` green; security residual risk documented | Done (0.6.5) |
| Deprecated APIs listed with replacements | **This file** |
| **Bake time** on stable labels before calling 1.0 | Open (no date — wait for real app usage) |

Related: [Roadmap 1.0](./ROADMAP.md#10--freeze) · [Publishing](./PUBLISHING.md)
