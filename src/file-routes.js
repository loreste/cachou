/**
 * File-based routing helpers.
 *
 * Convention (Vite import.meta.glob keys or virtual paths):
 *   routes/index.js              → /
 *   routes/about.js              → /about
 *   routes/users/[id].js         → /users/:id
 *   routes/blog/[...slug].js     → /blog/*   (wildcard)
 *   routes/(group)/settings.js   → /settings  (groups ignored in URL)
 *   routes/app/layout.js         → layout wrapping sibling & child routes
 *   routes/app/index.js          → /app
 *   routes/app/settings.js       → /app/settings
 *
 * Module shapes:
 *   export default Component
 *   export function load(ctx) { ... }
 *   export const fallback / error
 */

import { Route, Layout, NotFound } from "./router.js";
import { lazy } from "./router.js";
import { html } from "./html.js";

/**
 * Convert a file path relative to the routes root into a URL path pattern.
 * @param {string} filePath e.g. "users/[id].js" or "/src/routes/users/[id].js"
 * @param {{ routesDir?: string }} [options]
 */
export function filePathToRoutePath(filePath, options = {}) {
  let p = filePath.replace(/\\/g, "/");

  // Strip absolute-ish prefixes down to routes-relative
  const markers = ["/routes/", "routes/"];
  for (const m of markers) {
    const idx = p.indexOf(m);
    if (idx !== -1) {
      p = p.slice(idx + m.length);
      break;
    }
  }
  if (options.routesDir) {
    const rd = options.routesDir.replace(/\\/g, "/").replace(/\/$/, "") + "/";
    if (p.startsWith(rd)) p = p.slice(rd.length);
  }

  p = p.replace(/\.(js|mjs|ts|tsx|jsx|cachou)$/i, "");
  p = p.replace(/\/index$/i, "");
  if (p === "index" || p === "") return "/";

  const segments = p.split("/").filter(Boolean);
  const out = [];
  let wildcard = false;
  for (const seg of segments) {
    if (seg === "layout") continue;
    // route groups (auth) — omit from path
    if (/^\(.*\)$/.test(seg)) continue;
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      wildcard = true;
      continue;
    }
    if (seg.startsWith("[") && seg.endsWith("]")) {
      out.push(":" + seg.slice(1, -1));
      continue;
    }
    out.push(seg);
  }

  if (wildcard) {
    return out.length ? `/${out.join("/")}/*` : "/*";
  }
  if (!out.length) return "/";
  return "/" + out.join("/");
}

/**
 * @typedef {object} FileRouteModule
 * @property {any} [default]
 * @property {(ctx: any) => any} [load]
 * @property {any} [fallback]
 * @property {any} [error]
 * @property {any} [component]
 */

/**
 * Normalize Vite glob: { './routes/index.js': () => import(...) }
 * into sorted route entries.
 */
export function normalizeGlobModules(globMap, options = {}) {
  const entries = [];
  for (const [key, loader] of Object.entries(globMap || {})) {
    const base = key.split("/").pop() || "";
    const isLayout = /^layout\./i.test(base);
    const routePath = isLayout
      ? filePathToRoutePath(key.replace(/layout\.[^/]+$/i, "index.js"), options)
      : filePathToRoutePath(key, options);
    // layout path is the directory path
    let layoutPath = routePath;
    if (isLayout) {
      const dir = key.replace(/\\/g, "/").replace(/\/layout\.[^/]+$/i, "");
      layoutPath = filePathToRoutePath(dir + "/index.js", options);
    }
    entries.push({
      key,
      loader,
      isLayout,
      path: isLayout ? layoutPath : routePath,
      depth: (isLayout ? layoutPath : routePath).split("/").filter(Boolean).length
    });
  }
  entries.sort((a, b) => {
    if (a.isLayout !== b.isLayout) return a.isLayout ? -1 : 1;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.path.localeCompare(b.path);
  });
  return entries;
}

async function resolveModule(loaderOrMod) {
  if (typeof loaderOrMod === "function") {
    const mod = await loaderOrMod();
    return mod?.default !== undefined || mod?.component ? mod : mod;
  }
  return loaderOrMod;
}

function moduleToComponent(mod) {
  return mod.default || mod.component || (() => html`<div>Missing default export</div>`);
}

/**
 * Build Route/Layout elements from a static module map (already imported).
 *
 * @param {Record<string, FileRouteModule>} modules path → module
 * @param {{ notFound?: any, lazy?: boolean }} [options]
 */
export function createFileRoutes(modules, options = {}) {
  const globLike = {};
  for (const [k, v] of Object.entries(modules)) {
    globLike[k] = () => Promise.resolve(v);
  }
  return createFileRoutesFromGlob(globLike, { ...options, eager: true, modules });
}

/**
 * Build route tree from Vite `import.meta.glob` loaders.
 *
 * @param {Record<string, () => Promise<any>>} globMap
 * @param {{ notFound?: any, eager?: boolean, modules?: Record<string, any> }} [options]
 * @returns {() => any[]} factory returning Route/Layout children for Router
 */
export function createFileRoutesFromGlob(globMap, options = {}) {
  const entries = normalizeGlobModules(globMap, options);
  const layouts = entries.filter(e => e.isLayout);
  const pages = entries.filter(e => !e.isLayout);

  function pageFor(entry) {
    if (options.eager && options.modules && options.modules[entry.key]) {
      const mod = options.modules[entry.key];
      return Route({
        path: entry.path,
        component: moduleToComponent(mod),
        load: mod.load,
        fallback: mod.fallback,
        error: mod.error
      });
    }

    const LazyComp = lazy(async () => {
      const mod = await resolveModule(entry.loader);
      const Comp = moduleToComponent(mod);
      // Attach load onto a wrapper
      const Wrapped = (params, state) => {
        if (typeof Comp === "function") return Comp(params, state);
        return Comp;
      };
      Wrapped.load = mod.load;
      Wrapped.fallback = mod.fallback;
      Wrapped.error = mod.error;
      return { default: Wrapped, load: mod.load, fallback: mod.fallback, error: mod.error };
    });

    // We need load on Route, not only on component — resolve load eagerly when possible is hard.
    // Use a thin async boundary: Route without load; component uses createResource internally if needed.
    // Better: preload module metadata with a second pass. For simplicity, eager-import layout modules
    // and use lazy only for page components, reading load from cached module on first match.

    let cachedMod = null;
    const ensure = async () => {
      if (!cachedMod) cachedMod = await resolveModule(entry.loader);
      return cachedMod;
    };

    // Fire and forget cache for load binding
    ensure();

    return Route({
      path: entry.path,
      component: params => {
        const Comp = LazyComp;
        return typeof Comp === "function" ? Comp(params) : Comp;
      },
      load: async ctx => {
        const mod = await ensure();
        if (typeof mod.load === "function") return mod.load(ctx);
        return undefined;
      },
      fallback: () => {
        if (cachedMod?.fallback != null) {
          return typeof cachedMod.fallback === "function" ? cachedMod.fallback() : cachedMod.fallback;
        }
        return html`<div class="cachou-route-loading">Loading…</div>`;
      },
      error: (err, retry) => {
        if (cachedMod?.error != null) {
          return typeof cachedMod.error === "function" ? cachedMod.error(err, retry) : cachedMod.error;
        }
        return html`<div role="alert">${err.message}<button type="button" onclick=${retry}>Retry</button></div>`;
      }
    });
  }

  function childrenUnder(layoutPath) {
    const prefix = layoutPath === "/" ? "/" : layoutPath + "/";
    const childPages = pages.filter(p => {
      if (layoutPath === "/") {
        // top-level pages not under a deeper layout
        const underOther = layouts.some(
          l => l.path !== "/" && (p.path === l.path || p.path.startsWith(l.path + "/"))
        );
        if (underOther) return false;
        return true;
      }
      return p.path === layoutPath || p.path.startsWith(prefix);
    });

    const childLayouts = layouts.filter(l => {
      if (l.path === layoutPath) return false;
      if (layoutPath === "/") {
        // direct child layouts only
        const parent = layouts
          .filter(x => x.path !== l.path && (l.path === x.path || l.path.startsWith(x.path + "/")))
          .sort((a, b) => b.path.length - a.path.length)[0];
        return !parent || parent.path === "/";
      }
      return l.path.startsWith(prefix);
    });

    const nodes = [];
    for (const cl of childLayouts) {
      nodes.push(layoutNode(cl));
    }
    for (const pg of childPages) {
      // skip pages owned by a nested layout
      const owned = childLayouts.some(l => pg.path === l.path || pg.path.startsWith(l.path + "/"));
      if (owned) continue;
      nodes.push(pageFor(pg));
    }
    return nodes;
  }

  function layoutNode(entry) {
    const LayoutComp = lazy(async () => {
      const mod = await resolveModule(entry.loader);
      return { default: moduleToComponent(mod) };
    });

    if (options.eager && options.modules?.[entry.key]) {
      const mod = options.modules[entry.key];
      return Layout({
        path: entry.path,
        component: moduleToComponent(mod),
        children: childrenUnder(entry.path)
      });
    }

    return Layout({
      path: entry.path,
      component: props => {
        const C = LayoutComp;
        return typeof C === "function" ? C(props) : C;
      },
      children: childrenUnder(entry.path)
    });
  }

  const rootLayouts = layouts.filter(l => {
    const parent = layouts
      .filter(x => x.path !== l.path && (l.path === x.path || l.path.startsWith(x.path + "/")))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return !parent;
  });

  const tree = [];
  for (const rl of rootLayouts) {
    tree.push(layoutNode(rl));
  }
  // pages not under any layout
  for (const pg of pages) {
    const under = layouts.some(l => pg.path === l.path || pg.path.startsWith(l.path + "/"));
    if (!under) tree.push(pageFor(pg));
  }

  if (options.notFound !== false) {
    tree.push(
      NotFound({
        component:
          options.notFound ||
          (() => html`<h1>Not found</h1>`)
      })
    );
  }

  return tree;
}

/**
 * Convenience: Router children from glob.
 *
 * @example
 * const pages = import.meta.glob('./routes/**\/*.{js,jsx}');
 * Router({ children: fileRoutes(pages) })
 */
export function fileRoutes(globMap, options = {}) {
  return createFileRoutesFromGlob(globMap, options);
}
