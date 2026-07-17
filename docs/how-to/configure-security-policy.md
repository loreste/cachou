# Configure Security Policy

## Production defaults

```javascript
import { applyProductionSecurityDefaults, onFrameworkEvent } from "cachoujs";

applyProductionSecurityDefaults();

onFrameworkEvent(event => {
  if (event.type === "security-block") {
    // log / metrics
  }
});
```

This disables inline styles and limits URL protocols to `http:`, `https:`, `mailto:`, `tel:`.

## Custom policy

```javascript
import { configureSecurityPolicy, getSecurityPolicy } from "cachoujs";

configureSecurityPolicy({
  allowInlineStyles: false,
  allowedURLProtocols: ["https:", "http:", "mailto:", "tel:", "blob:"],
  allowedDataMimeTypes: ["image/", "application/pdf"]
});

console.log(getSecurityPolicy());
```

## Trusted HTML

```javascript
import { trustedHTML, sanitizeHTML, html } from "cachoujs";

// Basic defense-in-depth sanitizer (strips script/iframe/on*/javascript:)
const cleaned = sanitizeHTML(untrustedFromUser);
html`<article>${trustedHTML(cleaned)}</article>`;

// For rich-text / high-risk HTML, prefer DOMPurify (or similar) first:
// const body = trustedHTML(DOMPurify.sanitize(untrustedFromUser));
```

Never pass raw user HTML to `trustedHTML()` without sanitizing.

## CSP helpers (Node SSR)

```javascript
import {
  createCSPNonce,
  buildSecurityHeaders,
  applySecurityHeaders,
  dehydrate,
  createSSRContext,
  renderToStringAsync
} from "cachoujs";

const nonce = createCSPNonce();
const context = createSSRContext();
const appHtml = await renderToStringAsync(App, { path: req.url, context });
const state = dehydrate(context, { nonce });

applySecurityHeaders(
  res,
  buildSecurityHeaders({
    nonce,
    allowInlineStyles: false // use <style nonce="…"> when needed
  })
);
```

## Auth token storage

```javascript
import { createAuth } from "cachoujs";

// Prefer sessionStorage to limit token lifetime vs persistent XSS
const auth = createAuth({
  persist: "session", // "local" | "session" | "none"
  credentials: "same-origin" // when your API uses cookie sessions
});
```

Tokens are sanitized before storage/headers (control chars, newlines, oversized values rejected).

## Demo APIs

Privileged demo endpoints require `CACHOU_DEMO=1`. Production `npm start` defaults them off. Full threat model: [Security](../SECURITY.md).
