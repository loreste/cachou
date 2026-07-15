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
import { trustedHTML, html } from "cachoujs";

// ONLY after sanitizing with a library such as DOMPurify
const body = trustedHTML(sanitizedFromServer);
html`<article>${body}</article>`;
```

## Demo APIs

Privileged demo endpoints require `CACHOU_DEMO=1`. Production `npm start` defaults them off. Full threat model: [Security](../SECURITY.md).
