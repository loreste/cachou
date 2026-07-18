/**
 * Security helpers for Cachou apps (CSP headers, basic HTML sanitization, nonces).
 * Complements configureSecurityPolicy / applyProductionSecurityDefaults in html.js.
 * Browser-safe: no node: imports.
 */

/**
 * Generate a CSP-safe nonce (base64url, 16 random bytes).
 * Uses Web Crypto in modern Node and browsers.
 * @returns {string}
 */
export function createCSPNonce() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }
  // Last resort (not cryptographically strong) — still CSP-safe charset
  let out = "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let i = 0; i < 22; i++) {
    out += alphabet[(Math.random() * 64) | 0];
  }
  return out;
}

function bytesToBase64Url(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Build a Content-Security-Policy header value.
 *
 * @param {{
 *   nonce?: string,
 *   allowInlineStyles?: boolean,
 *   allowInlineScripts?: boolean,
 *   connectSrc?: string[],
 *   imgSrc?: string[],
 *   extraDirectives?: string[]
 * }} [options]
 * @returns {string}
 */
export function buildContentSecurityPolicy(options = {}) {
  const nonce =
    typeof options.nonce === "string" && /^[A-Za-z0-9+/=_-]+$/.test(options.nonce)
      ? options.nonce
      : "";
  const allowInlineStyles = options.allowInlineStyles === true;
  const allowInlineScripts = options.allowInlineScripts === true;
  const connectSrc = Array.isArray(options.connectSrc)
    ? options.connectSrc
    : ["'self'", "ws:", "wss:"];
  const imgSrc = Array.isArray(options.imgSrc) ? options.imgSrc : ["'self'", "data:"];

  const scriptSrc = ["'self'"];
  if (nonce) scriptSrc.push(`'nonce-${nonce}'`);
  if (allowInlineScripts) scriptSrc.push("'unsafe-inline'");

  const styleSrc = ["'self'"];
  if (nonce) styleSrc.push(`'nonce-${nonce}'`);
  // Browsers ignore 'unsafe-inline' for styles when a nonce is present in some
  // versions; prefer nonce-only when allowInlineStyles is false.
  if (allowInlineStyles && !nonce) styleSrc.push("'unsafe-inline'");
  if (allowInlineStyles && nonce) styleSrc.push("'unsafe-inline'");

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${styleSrc.join(" ")}`,
    `img-src ${imgSrc.join(" ")}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];
  if (Array.isArray(options.extraDirectives)) {
    for (const d of options.extraDirectives) {
      if (typeof d === "string" && d.trim()) directives.push(d.trim());
    }
  }
  return directives.join("; ");
}

/**
 * Standard HTTP security headers for Node (and similar) servers.
 *
 * @param {{
 *   nonce?: string,
 *   allowInlineStyles?: boolean,
 *   allowInlineScripts?: boolean,
 *   connectSrc?: string[],
 *   imgSrc?: string[],
 *   extraDirectives?: string[],
 *   includeCOOP?: boolean
 * }} [options]
 * @returns {Record<string, string>}
 */
export function buildSecurityHeaders(options = {}) {
  const headers = {
    "Content-Security-Policy": buildContentSecurityPolicy(options),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
  if (options.includeCOOP !== false) {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
  }
  return headers;
}

/**
 * Apply a headers object to a Node-style ServerResponse.
 * @param {{ setHeader: (k: string, v: string) => void }} res
 * @param {Record<string, string>} headers
 */
export function applySecurityHeaders(res, headers) {
  if (!res || typeof res.setHeader !== "function") return;
  for (const [key, value] of Object.entries(headers || {})) {
    if (value != null) res.setHeader(key, value);
  }
}

const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|object|embed|link|meta|base|form|svg|math|template|style|frame|frameset|applet|foreignobject)(?:\s[^>]*)?>/gi;
const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_ATTR =
  /\s(?:href|src|xlink:href|action|formaction|poster|data|srcdoc)\s*=\s*(['"]?)\s*(?:javascript|vbscript):[^'"\s>]*/gi;
const DATA_HTML_URL =
  /\s(?:href|src|srcdoc)\s*=\s*(['"]?)\s*data:\s*(?:text\/html|image\/svg\+xml)[^'"\s>]*/gi;
const STYLE_ATTR = /\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Decode common HTML entities used in XSS bypasses (hex/decimal numeric + a few named).
 * Applied before string-path sanitization so `onerror&#61;` and `&#106;avascript:` are visible.
 */
function decodeHtmlEntities(html) {
  return String(html)
    .replace(/&#x([0-9a-fA-F]{1,6});?/g, (_, hex) => {
      const code = parseInt(hex, 16);
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/&#([0-9]{1,7});?/g, (_, dec) => {
      const code = parseInt(dec, 10);
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    })
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&colon;/gi, ":")
    .replace(/&equals;/gi, "=")
    .replace(/&lpar;/gi, "(")
    .replace(/&rpar;/gi, ")");
}

/**
 * Basic HTML sanitizer for untrusted fragments.
 *
 * Removes dangerous tags, event-handler attributes, and javascript:/data HTML URLs.
 * This is a **defense-in-depth** helper — not a full browser HTML parser.
 * For high-risk rich text, use a dedicated library (e.g. DOMPurify) then wrap with
 * `trustedHTML()`.
 *
 * @param {string} input
 * @returns {string}
 */
export function sanitizeHTML(input) {
  if (input == null) return "";
  const html = String(input);

  // Prefer DOM-based cleaning when available (browser / happy-dom / jsdom)
  if (typeof DOMParser !== "undefined") {
    try {
      return sanitizeHTMLWithDOM(html);
    } catch {
      // fall through to string path
    }
  }

  return sanitizeHTMLString(html);
}

/**
 * True when a URL attribute value is a dangerous scheme after browsers compact
 * control chars / whitespace (Chromium treats `java\tscript:` as `javascript:`).
 */
function isDangerousURLValue(value) {
  const compact = String(value || "")
    .replace(/[\u0000-\u001F\u007F\s]+/g, "")
    .toLowerCase();
  return (
    compact.startsWith("javascript:") ||
    compact.startsWith("vbscript:") ||
    compact.startsWith("data:text/html") ||
    compact.startsWith("data:image/svg+xml")
  );
}

function sanitizeHTMLString(html) {
  // Decode entities first so nested/encoded payloads become visible to strippers.
  let out = decodeHtmlEntities(html);
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  // Iteratively strip nested dangerous tags: <scr<script>ipt> → <script> → gone
  for (let i = 0; i < 8; i++) {
    const next = out.replace(DANGEROUS_TAGS, "");
    if (next === out) break;
    out = next;
  }
  out = out.replace(EVENT_HANDLER_ATTR, "");
  out = out.replace(JS_URL_ATTR, " ");
  out = out.replace(DATA_HTML_URL, " ");
  // Drop inline styles — string path cannot reliably parse CSS gadgets.
  out = out.replace(STYLE_ATTR, "");
  // URL attrs: match full quoted values (including whitespace/control chars inside)
  // so `java\tscript:` / `java&#9;script:` cannot survive into trustedHTML sinks.
  out = out.replace(
    /\s(?:href|src|xlink:href|action|formaction|poster|data|srcdoc)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (full, doubleQuoted, singleQuoted, unquoted) => {
      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
      if (isDangerousURLValue(value)) return " ";
      return full;
    }
  );
  // Last-resort: strip bare scheme tokens even outside attributes
  out = out.replace(/javascript:/gi, "");
  out = out.replace(/vbscript:/gi, "");
  // Collapse whitespace-split schemes that remain after partial rewrites
  out = out.replace(/java[\u0000-\u001F\u007F\s]+script:/gi, "");
  out = out.replace(/vb[\u0000-\u001F\u007F\s]+script:/gi, "");
  return out;
}

const DANGEROUS_TAG_NAMES = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "svg",
  "math",
  "template",
  "style",
  "frame",
  "frameset",
  "applet",
  "foreignobject"
]);

function sanitizeHTMLWithDOM(html) {
  // Decode entities so the parser and attribute checks see the real payload.
  const decoded = decodeHtmlEntities(html);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${decoded}</body>`, "text/html");
  const body = doc.body;
  const walk = node => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (DANGEROUS_TAG_NAMES.has(tag)) {
          child.remove();
          continue;
        }
        const attrs = Array.from(child.attributes || []);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          const value = attr.value || "";
          if (name.startsWith("on") || name === "srcdoc" || name === "style") {
            child.removeAttribute(attr.name);
            continue;
          }
          if (
            ["href", "src", "xlink:href", "action", "formaction", "poster", "data"].includes(name)
          ) {
            if (isDangerousURLValue(value)) {
              child.removeAttribute(attr.name);
            }
          }
        }
        walk(child);
      } else if (child.nodeType === 8) {
        child.remove();
      }
    }
  };
  walk(body);
  return body.innerHTML;
}

/**
 * Sanitize a bearer/session token before storage or Authorization headers.
 * Strips control characters and enforces a max length.
 * @param {unknown} token
 * @param {{ maxLength?: number }} [options]
 * @returns {string|null}
 */
export function sanitizeAuthToken(token, options = {}) {
  if (token == null) return null;
  if (typeof token !== "string" && typeof token !== "number") return null;
  const maxLength = Number.isInteger(options.maxLength) ? options.maxLength : 8192;
  const raw = String(token);
  // Reject (do not silently strip) control characters / CR/LF that break headers
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;
  const value = raw.trim();
  if (!value || value.length > maxLength) return null;
  if (/[<>]/.test(value)) return null;
  return value;
}
