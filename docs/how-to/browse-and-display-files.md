# Browse and Display Files

Filesystem access is **server-backed** and **demo-gated** (`CACHOU_DEMO=1`). Default root is `./sandbox`, not the repository root.

## Endpoints

```http
GET /api/files?path=
GET /api/files?path=subdir&hidden=1
GET /api/files/content?path=hello.txt
```

## Client helpers

```javascript
import { createFileBrowser, createFileContent, signal, mapArray, html } from "cachoujs";

const [directory, files] = createFileBrowser("");
const [selectedPath, setSelectedPath] = signal("");
const [file] = createFileContent(selectedPath);

const browser = html`
  <div>
    <button onclick=${files.up}>Up</button>
    <ul>
      ${mapArray(
        () => directory()?.entries || [],
        entry => html`
          <li
            onclick=${() =>
              entry.type === "directory" ? files.open(entry.path) : setSelectedPath(entry.path)}
          >
            ${entry.type === "directory" ? "dir" : "file"} ${entry.name}
          </li>
        `,
        entry => entry.path,
        { uniqueKeys: true }
      )}
    </ul>
    <pre>${() => (file()?.kind === "text" ? file().content : "")}</pre>
  </div>
`;
```

## Configure root

```bash
CACHOU_FILES_ROOT=./sandbox CACHOU_DEMO=1 npm run dev
CACHOU_FILES_MAX_BYTES=2097152  # 2 MB
```

## Safety

- Read-only
- Path confined to configured root (symlink escape blocked)
- Hidden files excluded unless requested
- Size limited

Do not expose the files API on public production hosts. See [Security](../SECURITY.md).
