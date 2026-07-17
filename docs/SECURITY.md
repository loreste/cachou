# Security

CachouJS keeps privileged capabilities outside the browser runtime. This document is the threat model and operational guide for **v0.4.x** (current: **0.4.12**).

---

## Threat model

| Surface | Trust boundary | Notes |
|---------|----------------|-------|
| Browser runtime (`signal`, `html`, router) | Untrusted document / user input | Escapes text by default; URL and style policies apply |
| `trustedHTML()` | Application must sanitize first | Use `sanitizeHTML()` or DOMPurify before trusting |
| Demo APIs (`/api/todos`, `/api/db-query`, `/api/files`) | **Local demo only** | Require `CACHOU_DEMO=1`; disabled on production `npm start` by default |
| Files API | Server FS under configured root | Default root is `./sandbox`, not repo cwd |
| DB `runQuery` | Server process | Only simple allowlisted `SELECT` statements |
| WebSockets (`/ws-api`) | Demo-only + same-origin Origin check | Gated by `CACHOU_DEMO`; not multi-tenant auth |
| Your production APIs | Your authn/z | Out of scope for the framework — required for real apps |

Attackers who can open a browser page can already run arbitrary JS in that origin. The goal is to prevent:

1. Accidental XSS via templates  
2. Accidental privilege from demo endpoints in production  
3. Path traversal on the files API  
4. Arbitrary SQL execution via demo query endpoint  

---

## Runtime protections

| Control | Behavior |
|---------|----------|
| Text escaping | Dynamic SSR/client text uses HTML escape |
| Attribute escaping | Attribute values escaped on SSR |
| URL attributes | `href`, `src`, `action`, … sanitized against protocol allowlist |
| `data:` URLs | MIME prefix allowlist |
| Inline styles | Blocks `javascript:`, `expression(`, `-moz-binding`, `behavior:`, `@import`, `url(data:…)`; can disable all inline styles |
| HTML sinks | `innerHTML`, `outerHTML`, and `srcdoc` require `trustedHTML()` |
| Event handlers | Non-function handlers ignored; string `on*` attribute bindings blocked |
| `trustedHTML` | Explicit raw HTML only |
| `sanitizeHTML` | Strips script/iframe/on*/javascript: (defense-in-depth; not a full sanitizer) |
| CSP helpers | `createCSPNonce`, `buildSecurityHeaders`, `applySecurityHeaders` |
| Auth tokens | `sanitizeAuthToken`; `createAuth({ persist: "session" })` |
| Dehydrate | Optional CSP `nonce` on the state `<script>` tag |
| Resources | Request IDs, optional abort, stale suppression, optional timeouts, bounded browser cache |
| Tracing attributes | Sensitive keys (token, cookie, password, authorization, …) redacted |
| Logger | Silent by default; custom sinks never throw into app code |

### Configure policy

```javascript
import {
  applyProductionSecurityDefaults,
  configureSecurityPolicy,
  getSecurityPolicy,
  onFrameworkEvent
} from "cachoujs";

applyProductionSecurityDefaults();

configureSecurityPolicy({
  allowInlineStyles: false,
  allowedURLProtocols: ["https:", "http:", "mailto:", "tel:"]
});

onFrameworkEvent(event => {
  if (event.type === "security-block") {
    // observability
  }
});
```

---

## Demo mode

```bash
# Local demos (Vite sets CACHOU_DEMO=1 in development)
CACHOU_DEMO=1 npm run dev

# Production — leave demo APIs off
NODE_ENV=production CACHOU_DEMO=0 npm start
```

When demo mode is off, privileged endpoints return **403** with a JSON error.

Never enable `CACHOU_DEMO` on a public hostname.

---

## SQL (demo query endpoint)

`/api/db-query` does **not** execute arbitrary client SQL.

Allowed shape (simplified):

```sql
SELECT … FROM todos [ORDER BY …] [LIMIT n]
```

Rejected:

- Multiple statements (`;`)  
- Writes (`INSERT` / `UPDATE` / `DELETE` / …)  
- Unknown tables  
- Comments used to smuggle statements  

Implementation: `server/demo-guard.js` → `sanitizeReadOnlySelect`.

---

## Filesystem API

| Rule | Detail |
|------|--------|
| Mode | Read-only GET |
| Root | `CACHOU_FILES_ROOT` or `./sandbox` |
| Traversal | Lexical + `realpath` checks block `..` and symlink escape |
| Hidden | Dotted names excluded unless `hidden=1` |
| Size | `CACHOU_FILES_MAX_BYTES` (default 1 MB) |

## Demo production server (`server.js`)

Repo-only proving ground (not published on npm). Hardening includes:

| Control | Behavior |
|---------|----------|
| Demo gate | HTTP demo APIs + `/ws-api` require `CACHOU_DEMO` |
| Static assets | Resolved only under `dist/` (blocks `..` traversal) |
| SSR | Per-request `createSSRContext()` + explicit dehydrate/head |
| CSP | Nonce on dehydrate script; `object-src 'none'`; `frame-ancestors 'none'` |
| WS | Origin must match `Host` when present; table allowlist on `db-sync` |
| Rate limit | 120 req/min/IP with map size cap |
| Errors | Generic 500 bodies (no stack leakage to clients) |

---

## Production checklist

- [ ] `CACHOU_DEMO` disabled  
- [ ] CSP (prefer nonces / hashes; avoid `unsafe-inline` for scripts)  
- [ ] `applyProductionSecurityDefaults()` or stricter  
- [ ] Authn/z on all real APIs  
- [ ] Secure cookie flags  
- [ ] CSRF strategy for cookie sessions  
- [ ] Input validation on server  
- [ ] Dependency updates / audit  
- [ ] No secrets in client bundles  
- [ ] Logging for `security-block` / auth failures  
- [ ] Pass `{ nonce }` to `dehydrate(context, { nonce })` when using CSP nonces  
- [ ] Use `buildSecurityHeaders({ nonce })` on Node SSR responses  
- [ ] Prefer `createAuth({ persist: "session" })` or httpOnly cookies over long-lived localStorage tokens  
- [ ] Sanitize untrusted HTML with `sanitizeHTML` / DOMPurify before `trustedHTML`  

---

## Reporting issues

If you discover a vulnerability in the runtime sanitizers or demo guards, treat it as a security issue: avoid public exploit detail until a fix is available, and include reproduction steps, impact, and affected version.
