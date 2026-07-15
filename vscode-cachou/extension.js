"use strict";

const path = require("path");
const fs = require("fs");
const vscode = require("vscode");
const { runCompiler, defaultOutForFile } = require("./lib/compile");
const { registerDiagnostics, lintFile } = require("./lib/diagnostics");
const { registerCompletion } = require("./lib/completion");
const { registerHover } = require("./lib/hover");
const { openMarkdown, packageRoot } = require("./lib/docs");
const { getConfig, componentDirs, findPackageRoot, resolveFromWorkspace } = require("./lib/config");

let output;
let statusBar;

function log(message) {
  if (!output) return;
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function ensureOutput() {
  if (!output) {
    output = vscode.window.createOutputChannel("Cachou");
  }
  return output;
}

function updateStatusBar(editor) {
  if (!statusBar) return;
  if (!getConfig().get("showStatusBar")) {
    statusBar.hide();
    return;
  }
  if (editor && editor.document.languageId === "cachou") {
    statusBar.text = "$(symbol-misc) Cachou";
    statusBar.tooltip = "CachouJS — click to compile current file";
    statusBar.command = "cachou.compileCurrent";
    statusBar.show();
  } else {
    statusBar.hide();
  }
}

async function compileDocument(doc, { silent = false } = {}) {
  if (!doc || !doc.fileName.endsWith(".cachou")) {
    if (!silent) {
      vscode.window.showWarningMessage("Cachou: open a .cachou file to compile.");
    }
    return false;
  }

  if (doc.isDirty) {
    await doc.save();
  }

  const file = doc.uri.fsPath;
  const out = defaultOutForFile(file);
  ensureOutput().appendLine(`Compiling ${file}`);
  log(`$ compile -file ${file} -out ${out}`);

  const result = await runCompiler({ file, out, cwdHint: file });
  if (result.combined) {
    ensureOutput().appendLine(result.combined);
  }

  if (result.code === 0) {
    if (!silent) {
      vscode.window.setStatusBarMessage("Cachou: compiled successfully", 3000);
    }
    await lintFile(doc);
    return true;
  }

  if (!silent) {
    vscode.window.showErrorMessage(`Cachou compile failed — see Output → Cachou`);
    ensureOutput().show(true);
  }
  await lintFile(doc);
  return false;
}

async function compileWorkspace() {
  const root = packageRoot();
  const dirs = componentDirs();
  const existing = dirs
    .map(d => path.join(root, d))
    .filter(d => fs.existsSync(d));

  if (existing.length === 0) {
    // fallback: ask user or compile any **/*.cachou parent folders uniquely
    const files = await vscode.workspace.findFiles("**/*.cachou", "**/node_modules/**", 200);
    if (files.length === 0) {
      vscode.window.showInformationMessage("Cachou: no .cachou files found in the workspace.");
      return;
    }
    const uniqueDirs = [...new Set(files.map(f => path.dirname(f.fsPath)))];
    ensureOutput().show(true);
    let failed = 0;
    for (const dir of uniqueDirs) {
      log(`Compiling directory ${dir}`);
      const result = await runCompiler({ dir, out: dir, cwdHint: dir });
      if (result.combined) ensureOutput().appendLine(result.combined);
      if (result.code !== 0) failed++;
    }
    vscode.window.showInformationMessage(
      failed ? `Cachou: finished with ${failed} failing folder(s)` : `Cachou: compiled ${uniqueDirs.length} folder(s)`
    );
    return;
  }

  ensureOutput().show(true);
  let failed = 0;
  for (const dir of existing) {
    log(`Compiling ${dir}`);
    const result = await runCompiler({ dir, out: dir, cwdHint: dir });
    if (result.combined) ensureOutput().appendLine(result.combined);
    if (result.code !== 0) failed++;
  }
  vscode.window.showInformationMessage(
    failed
      ? `Cachou: workspace compile finished with errors (${failed})`
      : `Cachou: compiled ${existing.length} component director${existing.length === 1 ? "y" : "ies"}`
  );
}

async function createComponent() {
  const name = await vscode.window.showInputBox({
    prompt: "Component name (PascalCase or file name)",
    placeHolder: "StatCard",
    validateInput: v => (!v || !/^[\w-]+$/.test(v) ? "Use letters, numbers, _ or -" : null)
  });
  if (!name) return;

  const base = name.replace(/\.cachou$/i, "");
  const fileName = base.endsWith(".cachou") ? base : `${base}.cachou`;

  const folder =
    vscode.workspace.workspaceFolders?.[0] &&
    (await vscode.window.showQuickPick(
      [
        ...componentDirs().map(d => ({ label: d, description: "configured component dir" })),
        { label: "Browse…", description: "pick a folder" }
      ],
      { placeHolder: "Where should the component be created?" }
    ));

  let targetDir;
  const root = resolveFromWorkspace();
  if (!folder || folder.label === "Browse…") {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select folder"
    });
    if (!uris?.[0]) return;
    targetDir = uris[0].fsPath;
  } else {
    targetDir = path.join(packageRoot() || root, folder.label);
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const target = path.join(targetDir, fileName.endsWith(".cachou") ? fileName : `${fileName}.cachou`);
  if (fs.existsSync(target)) {
    vscode.window.showErrorMessage(`File already exists: ${target}`);
    return;
  }

  const componentName = path.basename(target, ".cachou");
  const content = `<script>
  // ${componentName} — setup runs once per instance
  const [count, setCount] = signal(props.initial ?? 0);
</script>

<style scoped>
  :host {
    display: block;
  }
  .root {
    padding: 1rem;
  }
</style>

<div class="root">
  <h2>{props.title ?? "${componentName}"}</h2>
  <button type="button" onclick={() => setCount(v => v + 1)}>
    Clicks: {count()}
  </button>
</div>
`;

  fs.writeFileSync(target, content, "utf8");
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc);
  await compileDocument(doc, { silent: true });
  vscode.window.showInformationMessage(`Created ${path.basename(target)}`);
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  ensureOutput();
  log("Cachou extension activated");

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(statusBar, output);

  registerDiagnostics(context);
  registerCompletion(context);
  registerHover(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("cachou.compileCurrent", async () => {
      const editor = vscode.window.activeTextEditor;
      await compileDocument(editor?.document);
    }),
    vscode.commands.registerCommand("cachou.compileWorkspace", () => compileWorkspace()),
    vscode.commands.registerCommand("cachou.createComponent", () => createComponent()),
    vscode.commands.registerCommand("cachou.openDocs", () => openMarkdown("README.md", "docs home")),
    vscode.commands.registerCommand("cachou.openApi", () => openMarkdown("API.md", "API")),
    vscode.commands.registerCommand("cachou.openHowTo", () => openMarkdown(["how-to", "README.md"], "how-to")),
    vscode.commands.registerCommand("cachou.openExamples", async () => {
      const root = packageRoot();
      const file = path.join(root, "examples", "README.md");
      if (fs.existsSync(file)) {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc, { preview: true });
      } else {
        vscode.window.showWarningMessage("examples/README.md not found in this workspace");
      }
    }),
    vscode.commands.registerCommand("cachou.restartDiagnostics", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.languageId === "cachou") {
        await lintFile(editor.document);
        vscode.window.showInformationMessage("Cachou diagnostics refreshed");
      }
    }),
    vscode.commands.registerCommand("cachou.showOutput", () => ensureOutput().show(true)),
    vscode.workspace.onDidSaveTextDocument(async doc => {
      if (doc.languageId === "cachou" && getConfig().get("compileOnSave")) {
        await compileDocument(doc, { silent: true });
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(updateStatusBar)
  );

  updateStatusBar(vscode.window.activeTextEditor);

  // Warm message once if compiler root found
  const root = findPackageRoot(resolveFromWorkspace());
  if (root) {
    log(`Package root: ${root}`);
  } else {
    log("No local cachoujs package root detected — will try npx/global compiler");
  }
}

function deactivate() {
  // disposables handled by context.subscriptions
}

module.exports = {
  activate,
  deactivate
};
