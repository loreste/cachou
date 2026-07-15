# CachouJS Browser DevTools (Chrome / Edge / Chromium)

Manifest V3 extension that toggles the in-page `mountDevtools()` panel on pages that expose the runtime.

## Load unpacked

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder: `extensions/browser-devtools`.

Icons are optional; if missing, Chrome still loads the extension.

## App setup (required)

In your app entry:

```js
import * as Cachou from "cachoujs";

if (import.meta.env.DEV) {
  window.__CACHOU_RUNTIME__ = Cachou;
  Cachou.installDevtoolsHotkey?.(); // Ctrl+Shift+D still works without the extension
}
```

## Use

1. Open a page running Cachou with the bridge set.
2. Click the extension icon → **Toggle DevTools**.
3. The floating panel shows snapshot counts and framework events.

## Privacy

No data is sent off-device. The extension only injects a small page bridge and relays toggle messages.
