# Use In-Page DevTools

Cachou ships a **lightweight floating panel** (not a Chrome Web Store extension).

## Open the panel

```javascript
import { mountDevtools, installDevtoolsHotkey } from "cachoujs";
// or: import { mountDevtools } from "cachoujs/devtools";

installDevtoolsHotkey(); // Ctrl+Shift+D
mountDevtools();         // or call from a button
```

## What you see

- Live signal / computation / root counts (`getDebugSnapshot`)
- Orphan computation count (leak hint)
- Recent `onFrameworkEvent` stream (security-block, resource-error, slow-effect, …)

## API

| Function | Role |
|----------|------|
| `mountDevtools(options?)` | Open panel; enables debug mode by default |
| `unmountDevtools()` | Close |
| `isDevtoolsOpen()` | Boolean |
| `installDevtoolsHotkey()` | Toggle with Ctrl+Shift+D |

Options: `{ parent, enableDebugMode }`.

## Browser extension (Chrome / Edge)

Load unpacked from the monorepo:

`extensions/browser-devtools/`

Expose the runtime on the page:

```javascript
import * as Cachou from "cachoujs";
if (import.meta.env.DEV) {
  window.__CACHOU_RUNTIME__ = Cachou;
  installDevtoolsHotkey();
}
```

Then use the extension popup → **Toggle DevTools**. Details: [extensions/browser-devtools/README.md](../../extensions/browser-devtools/README.md).

## Production

Do not mount DevTools in production builds:

```javascript
if (import.meta.env.DEV) {
  installDevtoolsHotkey();
}
```
