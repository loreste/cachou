/**
 * High-level SSR helpers for production Node (and similar) servers.
 * Pure framework API — no `node:http` dependency.
 */

import { createSSRContext } from "./ssr-context.js";
import { dehydrate, getSSRHead } from "./reactivity.js";
import { renderToStringAsync, renderToStream } from "./html.js";

/**
 * Render an application to HTML parts for a single request.
 *
 * Always uses an explicit SSR context (safe under concurrency). Returns
 * body HTML, head fragment, and dehydrate state script so callers can
 * assemble a document shell.
 *
 * @param {() => any | ((data: any) => any)} Component
 * @param {{
 *   path?: string,
 *   request?: any,
 *   signal?: AbortSignal | null,
 *   context?: object,
 *   preload?: (args: { request: any, signal?: AbortSignal | null }) => any | Promise<any>,
 *   traceparent?: string,
 *   nonce?: string,
 *   mode?: "async" | "stream"
 * }} [options]
 * @returns {Promise<{
 *   html: string,
 *   head: string,
 *   state: string,
 *   context: object,
 *   stream?: ReadableStream | AsyncGenerator
 * }>}
 */
export async function renderApplication(Component, options = {}) {
  const context = options.context || createSSRContext();
  const mode = options.mode === "stream" ? "stream" : "async";
  const renderOptions = {
    path: options.path,
    request: options.request,
    signal: options.signal,
    context,
    preload: options.preload,
    traceparent: options.traceparent
  };

  if (mode === "stream") {
    const stream = renderToStream(Component, renderOptions);
    return {
      html: "",
      head: "",
      state: "",
      context,
      stream
    };
  }

  const html = await renderToStringAsync(Component, renderOptions);
  const state = dehydrate(context, { nonce: options.nonce });
  const head = getSSRHead(context);
  return { html, head, state, context };
}

/**
 * Assemble a minimal HTML document from renderApplication parts.
 *
 * @param {{
 *   html: string,
 *   head?: string,
 *   state?: string,
 *   title?: string,
 *   lang?: string,
 *   bodyAttrs?: string,
 *   scripts?: string,
 *   styles?: string
 * }} parts
 * @returns {string}
 */
export function htmlDocument(parts) {
  const lang = parts.lang || "en";
  const title = parts.title || "";
  const headExtra = parts.head || "";
  const state = parts.state || "";
  const styles = parts.styles || "";
  const scripts = parts.scripts || "";
  const bodyAttrs = parts.bodyAttrs ? ` ${parts.bodyAttrs}` : "";
  const titleTag = title ? `<title>${escapeBasic(title)}</title>\n` : "";
  return `<!DOCTYPE html>
<html lang="${escapeBasic(lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${titleTag}${headExtra}${state}${styles}
</head>
<body${bodyAttrs}>
<div id="app">${parts.html || ""}</div>
${scripts}
</body>
</html>`;
}

function escapeBasic(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
