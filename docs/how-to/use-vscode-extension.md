# Use the VS Code / Cursor Extension

The monorepo ships a **CachouJS editor extension** under [`vscode-cachou/`](../../vscode-cachou/).

## What it provides

- `.cachou` language mode (highlighting for `<script>`, `<style scoped>`, templates, `{expressions}`)
- Snippets for SFCs and for JavaScript/TypeScript (`cachou-import`, `cachou-mount`, …)
- Completions + hover for runtime APIs and directives
- **Compile current file** / **Compile workspace** (uses repo compiler)
- **Diagnostics** from the real Go compiler (Problems panel)
- Compile on save (default on)
- Open docs / API / how-tos / examples from the Command Palette
- **Create Component…** scaffold

Full extension readme: [vscode-cachou/README.md](../../vscode-cachou/README.md).

---

## Run from this repo (recommended while developing)

1. Open the **cachou** workspace root in VS Code or Cursor.  
2. Run **Debug: Start Debugging** and choose **Run Cachou Extension**  
   (config: `.vscode/launch.json` → `extensionDevelopmentPath=vscode-cachou`).  
3. A new Extension Development Host window opens with the extension loaded.  
4. Open any `*.cachou` file (e.g. `demo/components/StatCard.cachou`).

Or from a terminal:

```bash
code --extensionDevelopmentPath="$(pwd)/vscode-cachou" "$(pwd)"
# Cursor:
# cursor --extensionDevelopmentPath="$(pwd)/vscode-cachou" "$(pwd)"
```

---

## Install as a local extension

```bash
cd vscode-cachou
npx @vscode/vsce package --no-dependencies
code --install-extension cachou-0.6.0.vsix
```

Dev symlink:

```bash
ln -sf "$(pwd)/vscode-cachou" ~/.vscode/extensions/cachoujs.cachou-0.6.0
# Reload Window
```

---

## Marketplace publish path (maintainers)

Not published to the VS Marketplace yet. When ready:

1. Create a [Visual Studio Marketplace publisher](https://marketplace.visualstudio.com/manage) (e.g. `cachoujs`).
2. Set `"publisher"` in `vscode-cachou/package.json` (already `cachoujs`).
3. Package and publish (token stays local — never commit):

```bash
cd vscode-cachou
npx @vscode/vsce login cachoujs
npx @vscode/vsce package --no-dependencies
npx @vscode/vsce publish --no-dependencies
```

4. Optional CI: GitHub Action with `VSCE_PAT` secret on tag `vscode-v*`.

Until then, VSIX from this repo is the supported install path.

---

## Everyday commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Use |
|---------|-----|
| `Cachou: Compile Current File` | Emit `.js` + `.css` next to the SFC |
| `Cachou: Compile Workspace Components` | Compile configured dirs |
| `Cachou: Create Component…` | Scaffold a new `.cachou` file |
| `Cachou: Open Documentation` | `docs/README.md` |
| `Cachou: Open API Reference` | `docs/API.md` |
| `Cachou: Open How-To Guides` | `docs/how-to/README.md` |
| `Cachou: Show Output Channel` | Compiler logs |

Editor title bar play icon also compiles the active `.cachou` file.

---

## Settings

Search **Cachou** in Settings, or `settings.json`:

```json
{
  "cachou.compileOnSave": true,
  "cachou.diagnostics": true,
  "cachou.runtime": "cachoujs",
  "cachou.componentDirs": [
    "src/components",
    "demo/components",
    "crm/src/components"
  ]
}
```

---

## Snippets

In a `.cachou` file type `cc` → full component scaffold.  
In JS/TS type `cachou-import` or `cachou-mount`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No diagnostics / compile fails | Build compiler: `npm run compiler:build` from repo root; check Output → **Cachou** |
| Wrong runtime import | Set `cachou.runtime` |
| Docs commands 404 | Open the monorepo root so `docs/` resolves |
| Highlighting missing | Ensure language mode is **Cachou** (status bar) |

## Next

- [Work with `.cachou` files](./work-with-cachou-files.md)  
- [Compiler reference](../COMPILER.md)  
