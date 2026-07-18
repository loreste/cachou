/**
 * Thin SSR adapters for Fetch API runtimes (Cloudflare Workers, Deno, Bun, etc.).
 *
 * Pure framework helpers — no Node `http` dependency. Prefer Node
 * `examples/node-ssr` for classic Node servers.
 *
 * @module cachoujs/ssr-adapters
 */

import {
  createCSPNonce,
  buildSecurityHeaders
} from "./security.js";
import { applyProductionSecurityDefaults } from "./html.js";
import { renderApplication, htmlDocument } from "./ssr-render.js";

/**
 * Convert renderToStream / renderApplication stream output into a web ReadableStream.
 * @param {ReadableStream | AsyncGenerator<any> | AsyncIterable<any> | null | undefined} stream
 * @returns {ReadableStream | null}
 */
export function toReadableStream(stream) {
  if (!stream) return null;
  if (typeof ReadableStream !== "undefined" && stream instanceof ReadableStream) {
    return stream;
  }
  if (typeof stream[Symbol.asyncIterator] === "function") {
    const iterator = stream[Symbol.asyncIterator]();
    const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
    return new ReadableStream({
      async pull(controller) {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        const chunk = value == null ? "" : String(value);
        controller.enqueue(encoder ? encoder.encode(chunk) : chunk);
      },
      async cancel(reason) {
        await iterator.return?.(reason);
      }
    });
  }
  return null;
}

/**
 * Build response Headers from a security-headers object + extras.
 * @param {Record<string, string>} securityHeaders
 * @param {Record<string, string>} [extra]
 * @returns {Headers}
 */
export function buildResponseHeaders(securityHeaders = {}, extra = {}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(securityHeaders || {})) {
    if (value != null && value !== "") headers.set(key, String(value));
  }
  for (const [key, value] of Object.entries(extra || {})) {
    if (value != null && value !== "") headers.set(key, String(value));
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }
  return headers;
}

/**
 * Resolve path + search from a Fetch Request (or Request-like).
 * @param {Request | { url?: string }} request
 * @returns {string}
 */
export function requestPath(request) {
  try {
    const url = new URL(request.url, "http://localhost");
    return `${url.pathname}${url.search}`;
  } catch {
    return typeof request?.url === "string" ? request.url : "/";
  }
}

/**
 * Render a Cachou app for one Fetch Request and return a Response.
 *
 * @param {(data?: any) => any} Component
 * @param {Request} request
 * @param {{
 *   title?: string,
 *   lang?: string,
 *   styles?: string,
 *   scripts?: string,
 *   bodyAttrs?: string,
 *   nonce?: string,
 *   stream?: boolean,
 *   status?: number,
 *   headers?: Record<string, string>,
 *   security?: Parameters<typeof buildSecurityHeaders>[0],
 *   applySecurityDefaults?: boolean,
 *   path?: string,
 *   preload?: any,
 *   traceparent?: string,
 *   context?: any,
 *   signal?: AbortSignal | null,
 *   onError?: (err: Error, request: Request) => Response | Promise<Response>
 * }} [options]
 * @returns {Promise<Response>}
 */
export async function handleFetchRequest(Component, request, options = {}) {
  if (options.applySecurityDefaults !== false) {
    applyProductionSecurityDefaults();
  }

  const nonce =
    typeof options.nonce === "string" && options.nonce
      ? options.nonce
      : createCSPNonce();

  try {
    const path = options.path != null ? options.path : requestPath(request);
    const signal =
      options.signal !== undefined
        ? options.signal
        : request && "signal" in request
          ? request.signal
          : null;

    const mode = options.stream ? "stream" : "async";
    const result = await renderApplication(Component, {
      path,
      request,
      signal,
      context: options.context,
      preload: options.preload,
      traceparent: options.traceparent,
      nonce,
      mode
    });

    const security = buildSecurityHeaders({
      nonce,
      allowInlineStyles: false,
      ...(options.security || {})
    });
    const headers = buildResponseHeaders(security, options.headers);
    // CSP often needs the nonce for any inline style/script the adapter injects
    const status = options.status || 200;

    if (mode === "stream" && result.stream) {
      const body = toReadableStream(result.stream);
      if (!body) {
        throw new Error("SSR stream is not available as a ReadableStream in this runtime.");
      }
      return new Response(body, { status, headers });
    }

    const page = htmlDocument({
      html: result.html,
      head: result.head,
      state: result.state,
      title: options.title,
      lang: options.lang,
      styles: options.styles,
      scripts: options.scripts,
      bodyAttrs: options.bodyAttrs
    });

    return new Response(page, { status, headers });
  } catch (err) {
    if (typeof options.onError === "function") {
      return options.onError(err, request);
    }
    const security = buildSecurityHeaders({
      allowInlineStyles: false,
      ...(options.security || {})
    });
    const headers = buildResponseHeaders(security, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    const message =
      typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production"
        ? "Internal Server Error"
        : err && err.stack
          ? String(err.stack)
          : String(err && err.message ? err.message : err);
    return new Response(message, { status: 500, headers });
  }
}

/**
 * Create a `(request) => Response` handler for Workers / Deno / Bun.
 *
 * @param {(data?: any) => any} Component
 * @param {Parameters<typeof handleFetchRequest>[2]} [options]
 * @returns {(request: Request) => Promise<Response>}
 *
 * @example
 * // Cloudflare Worker
 * import { createFetchHandler } from "cachoujs/ssr-adapters";
 * export default { fetch: createFetchHandler(App, { title: "App" }) };
 *
 * // Deno
 * Deno.serve(createFetchHandler(App, { title: "App" }));
 */
export function createFetchHandler(Component, options = {}) {
  return request => handleFetchRequest(Component, request, options);
}
