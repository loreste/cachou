/**
 * Static site / pre-render helpers (build-time HTML generation).
 *
 * Uses `renderApplication` + `htmlDocument` — no Node dependency for
 * `prerenderRoutes`. Optional `writePrerendered` uses `node:fs` dynamically.
 *
 * @module cachoujs/static
 */

import { createCSPNonce } from "./security.js";
import { applyProductionSecurityDefaults } from "./html.js";
import { renderApplication, htmlDocument } from "./ssr-render.js";

/**
 * Map a URL path to a relative HTML file under an output directory.
 *
 * - `/` → `index.html`
 * - `/about` → `about/index.html`
 * - `/blog/post` → `blog/post/index.html`
 * - Trailing slashes normalized
 *
 * @param {string} routePath
 * @returns {string}
 */
export function routeToFilePath(routePath) {
  let path = String(routePath || "/").trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  // strip query/hash for file output
  path = path.split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "/" || path === "") return "index.html";
  const cleaned = path.replace(/^\/+/, "").replace(/\/+/g, "/");
  return `${cleaned}/index.html`;
}

/**
 * Normalize a route entry to `{ path, title?, ... }`.
 * @param {string | { path: string, title?: string, [key: string]: any }} route
 */
function normalizeRoute(route) {
  if (typeof route === "string") return { path: route };
  if (route && typeof route.path === "string") return route;
  throw new TypeError("Each route must be a path string or { path, ... } object");
}

/**
 * Pre-render one or more routes of a Cachou app to full HTML documents.
 *
 * @param {(data?: any) => any} Component
 * @param {{
 *   routes: Array<string | { path: string, title?: string, lang?: string, styles?: string, scripts?: string, bodyAttrs?: string, preload?: any }>,
 *   title?: string | ((route: { path: string }) => string | undefined),
 *   lang?: string,
 *   styles?: string,
 *   scripts?: string,
 *   bodyAttrs?: string,
 *   nonce?: string | false,
 *   applySecurityDefaults?: boolean,
 *   concurrent?: boolean,
 *   render?: {
 *     preload?: any,
 *     traceparent?: string,
 *     context?: any,
 *     signal?: AbortSignal | null
 *   },
 *   request?: (routePath: string) => any
 * }} options
 * @returns {Promise<Array<{
 *   path: string,
 *   file: string,
 *   html: string,
 *   head: string,
 *   state: string,
 *   body: string
 * }>>}
 */
export async function prerenderRoutes(Component, options = {}) {
  if (!options || !Array.isArray(options.routes) || options.routes.length === 0) {
    throw new TypeError("prerenderRoutes requires options.routes (non-empty array)");
  }
  if (options.applySecurityDefaults !== false) {
    applyProductionSecurityDefaults();
  }

  const routes = options.routes.map(normalizeRoute);
  const concurrent = options.concurrent === true;

  const runOne = async route => {
    const path = route.path.startsWith("/") ? route.path : `/${route.path}`;
    const nonce =
      options.nonce === false
        ? undefined
        : typeof options.nonce === "string"
          ? options.nonce
          : createCSPNonce();

    const request =
      typeof options.request === "function"
        ? options.request(path)
        : { url: path, method: "GET" };

    const renderOpts = {
      path,
      request,
      signal: options.render?.signal,
      context: options.render?.context,
      preload: route.preload || options.render?.preload,
      traceparent: options.render?.traceparent,
      nonce,
      mode: "async"
    };

    const { html: body, head, state } = await renderApplication(Component, renderOpts);

    const title =
      route.title != null
        ? route.title
        : typeof options.title === "function"
          ? options.title({ path })
          : options.title;

    const document = htmlDocument({
      html: body,
      head,
      state,
      title,
      lang: route.lang || options.lang,
      styles: route.styles != null ? route.styles : options.styles,
      scripts: route.scripts != null ? route.scripts : options.scripts,
      bodyAttrs: route.bodyAttrs != null ? route.bodyAttrs : options.bodyAttrs
    });

    return {
      path,
      file: routeToFilePath(path),
      html: document,
      head: head || "",
      state: state || "",
      body: body || ""
    };
  };

  if (concurrent) {
    return Promise.all(routes.map(runOne));
  }

  const results = [];
  for (const route of routes) {
    results.push(await runOne(route));
  }
  return results;
}

/**
 * Write prerender results to disk (Node / build scripts only).
 *
 * @param {Array<{ file: string, html: string }>} results
 * @param {string} outDir Absolute or relative output directory
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<Array<{ file: string, absolute: string, bytes: number }>>}
 */
export async function writePrerendered(results, outDir, options = {}) {
  if (!outDir || typeof outDir !== "string") {
    throw new TypeError("writePrerendered requires outDir string");
  }
  if (!Array.isArray(results)) {
    throw new TypeError("writePrerendered requires results array");
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const written = [];

  for (const item of results) {
    if (!item || typeof item.file !== "string") {
      throw new TypeError("Each result must include a file path");
    }
    const absolute = path.resolve(outDir, item.file);
    const html = item.html == null ? "" : String(item.html);
    if (!options.dryRun) {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, html, "utf8");
    }
    written.push({ file: item.file, absolute, bytes: Buffer.byteLength(html, "utf8") });
  }

  return written;
}

/**
 * Convenience: prerender + write in one call (Node build scripts).
 *
 * @param {(data?: any) => any} Component
 * @param {Parameters<typeof prerenderRoutes>[1] & { outDir: string, dryRun?: boolean }} options
 */
export async function prerenderToDir(Component, options = {}) {
  if (!options.outDir) {
    throw new TypeError("prerenderToDir requires options.outDir");
  }
  const pages = await prerenderRoutes(Component, options);
  const written = await writePrerendered(pages, options.outDir, {
    dryRun: options.dryRun
  });
  return { pages, written };
}
