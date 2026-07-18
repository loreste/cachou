# Use the browser DevTools extension

**Status:** experimental · not on the Chrome Web Store yet

Related: [Use DevTools (in-page)](./use-devtools.md) · extension source [`extensions/browser-devtools/`](../../extensions/browser-devtools/)

---

## Two options

| Option | When |
|--------|------|
| **In-page panel** | `mountDevtools()` / `installDevtoolsHotkey()` — always available from `cachoujs` |
| **Browser extension** | Toggle the same panel from a toolbar icon on any page that exposes the runtime bridge |

---

## App bridge (required for the extension)

```js
import * as Cachou from "cachoujs/browser";

if (import.meta.env.DEV) {
  window.__CACHOU_RUNTIME__ = Cachou;
  Cachou.installDevtoolsHotkey(); // Ctrl+Shift+D without the extension
}
```

Never expose the full runtime on production origins unless you accept the debug surface.

---

## Load unpacked (Chrome / Edge / Chromium)

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `extensions/browser-devtools` in this repo
3. Open your app page → click the extension → **Toggle DevTools**

### Package a zip for sharing

From the monorepo root:

```bash
npm run ext:devtools
# writes extensions/browser-devtools/cachou-devtools-<version>.zip
```

Import the zip via “Load unpacked” after unzipping, or distribute the zip to teammates.

---

## Privacy

No network calls. The extension injects a small page bridge and relays toggle messages. See the extension README for details.

---

## Chrome Web Store

Not published. When ready, package the zip, create a developer account, and submit `extensions/browser-devtools` (MV3). Until then, unpacked / zip install is the supported path.
