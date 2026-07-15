# Use the FileBrowser Component

Ready-made UI for the **demo** read-only filesystem API. Requires `CACHOU_DEMO=1` and a server that implements `/api/files`.

Related: [Browse and display files](./browse-and-display-files.md), [Security](../SECURITY.md).

---

## Configure the server root

Default root is `./sandbox` (not the whole repo):

```bash
CACHOU_DEMO=1 CACHOU_FILES_ROOT=./sandbox npm run dev
```

Place demo files under `sandbox/` (this repo ships `sandbox/hello.txt`).

---

## Render the component

```javascript
import { FileBrowser, mount, html } from "cachoujs";

function App() {
  return html`
    <div class="page">
      <h1>Files</h1>
      ${FileBrowser({
        initialPath: "",
        includeHidden: false,
        onSelect(entry) {
          console.log(entry.type, entry.path, entry.size);
        }
      })}
    </div>
  `;
}

mount(App, document.getElementById("app"));
```

### Props

| Prop | Role |
|------|------|
| `initialPath` | Starting relative path |
| `includeHidden` | Show dotfiles |
| `key` / `contentKey` | Resource cache keys |
| `class` | Extra class on root |
| `onSelect` | Called when a file entry is chosen |

---

## Styling hooks

| Class | Region |
|-------|--------|
| `.cachou-file-browser` | Root |
| `.cachou-file-browser__header` | Header |
| `.cachou-file-browser__breadcrumbs` | Path crumbs |
| `.cachou-file-browser__body` | Main body |
| `.cachou-file-browser__list` | Entry list |
| `.cachou-file-browser__preview` | Content preview |

```javascript
FileBrowser({ class: "my-file-browser" });
```

```css
.my-file-browser.cachou-file-browser {
  border: 1px solid #ccc;
  border-radius: 8px;
}
```

---

## Programmatic helpers

If you need a custom UI, use the lower-level APIs instead of the component:

```javascript
import { createFileBrowser, createFileContent, listFiles, readFile } from "cachoujs";

const [directory, browser] = createFileBrowser("");
await browser.open("subdir");
const [file] = createFileContent(() => selectedPath());
```

See [Browse and display files](./browse-and-display-files.md).

---

## Security boundary

- **Not** the browser File System Access API  
- Only displays data from the server’s sandboxed, read-only endpoints  
- Disabled when `CACHOU_DEMO` is off  
- Do not expose on public production hosts  

## Next

- [Browse and display files](./browse-and-display-files.md)
- [Configure security policy](./configure-security-policy.md)
