# CachouJS for Visual Studio Code

Language support and tooling for **[CachouJS](https://github.com/cachoujs/cachou)** — fine-grained reactive JavaScript and `.cachou` single-file components.

## Features

| Feature | Description |
|---------|-------------|
| **`.cachou` language** | File association, icons, brackets, folding |
| **Syntax highlighting** | Embedded JS (`<script>`), CSS (`<style>` / `scoped`), HTML template, `{expressions}` |
| **Snippets** | Component scaffolds, signals, resources, directives (also JS/TS snippets for `cachoujs` imports) |
| **Completions** | Runtime APIs in `<script>`, directives in templates, `:host` / `:global` in styles |
| **Hover docs** | Quick tips for APIs and directives |
| **Compile** | Compile current file or configured workspace component dirs |
| **Diagnostics** | Compiler errors as Problems (unsaved buffers use a temp file) |
| **Compile on save** | Optional (on by default) |
| **Docs commands** | Open workspace `docs/`, API, how-tos, examples |
| **Create component** | Scaffold a new `.cachou` file from the command palette |
| **Status bar** | Quick compile when a `.cachou` editor is active |

## Install (this monorepo)

### Option A — Launch Extension Development Host

1. Open the `vscode-cachou` folder (or the repo root) in VS Code / Cursor.  
2. Open `vscode-cachou/extension.js`.  
3. Run **Debug: Start Debugging** with a simple launch config, or:

```bash
code --extensionDevelopmentPath=/absolute/path/to/cachou/vscode-cachou
```

### Option B — Install from VSIX

```bash
cd vscode-cachou
npx @vscode/vsce package --no-dependencies
code --install-extension cachou-0.2.0.vsix
```

### Option C — Symlink into extensions dir (dev)

```bash
ln -s /absolute/path/to/cachou/vscode-cachou \
  ~/.vscode/extensions/cachoujs.cachou-0.2.0
# or for Cursor:
# ~/.cursor/extensions/cachoujs.cachou-0.2.0
```

Reload the window after linking.

## Commands

| Command | ID |
|---------|-----|
| Compile Current File | `cachou.compileCurrent` |
| Compile Workspace Components | `cachou.compileWorkspace` |
| Create Component… | `cachou.createComponent` |
| Open Documentation | `cachou.openDocs` |
| Open API Reference | `cachou.openApi` |
| Open How-To Guides | `cachou.openHowTo` |
| Open Examples README | `cachou.openExamples` |
| Restart Diagnostics | `cachou.restartDiagnostics` |
| Show Output Channel | `cachou.showOutput` |

## Settings

| Setting | Default | Meaning |
|---------|---------|---------|
| `cachou.compilerPath` | `""` | Custom compiler binary/script; empty = auto |
| `cachou.runtime` | `cachoujs` | `-runtime` import specifier |
| `cachou.componentDirs` | `src/components`, `demo/components`, `crm/src/components` | Workspace compile targets |
| `cachou.compileOnSave` | `true` | Compile active `.cachou` on save |
| `cachou.diagnostics` | `true` | Show compiler problems |
| `cachou.diagnosticsDebounceMs` | `400` | Debounce for change diagnostics |
| `cachou.showStatusBar` | `true` | Status bar item |
| `cachou.docsPath` | `docs` | Docs folder relative to package root |

### Compiler auto-detection order

1. `cachou.compilerPath`  
2. `bin/cachou-compiler`  
3. `bin/cachou-compiler-wrapper.mjs`  
4. `scripts/run-compiler.mjs`  
5. `go run compiler.go`  
6. `npx cachou-compiler`  

Works best when the workspace is the Cachou monorepo (or an app that depends on `cachoujs` with the compiler available).

## Snippets (`.cachou`)

| Prefix | Expands to |
|--------|------------|
| `cc` / `cachou-component` | Full SFC scaffold |
| `signal` | Signal pair |
| `resource` | `createResource` |
| `mapArray` | Keyed list |
| `style-scoped` | Scoped CSS block |
| `class:` / `bind:value` | Template directives |

JS/TS: `cachou-import`, `cachou-mount`, `cresource`, `crouter`, `cachou-vite`, …

## Requirements

- VS Code / Cursor **1.85+**  
- For compile/diagnostics: **Node** and either a built compiler binary, Go, or `cachoujs` on disk  

## Project docs

When this extension runs inside the Cachou repo:

- [Documentation home](../docs/README.md)  
- [How-to guides](../docs/how-to/README.md)  
- [Compiler reference](../docs/COMPILER.md)  
- [API reference](../docs/API.md)  

## License

MIT — same as the CachouJS project unless otherwise noted.
