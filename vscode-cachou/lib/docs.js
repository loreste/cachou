"use strict";

const path = require("path");
const fs = require("fs");
const vscode = require("vscode");
const { resolveFromWorkspace, findPackageRoot, docsPath, workspaceFolders } = require("./config");

function packageRoot() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const root = findPackageRoot(path.dirname(editor.document.uri.fsPath));
    if (root) return root;
  }
  return resolveFromWorkspace();
}

function resolveDoc(...parts) {
  const root = packageRoot();
  const base = path.join(root, docsPath());
  const file = path.join(base, ...parts);
  if (fs.existsSync(file)) return file;
  // fallback to repo docs even if docsPath customized wrong
  const alt = path.join(root, "docs", ...parts);
  if (fs.existsSync(alt)) return alt;
  return file;
}

async function openMarkdown(relParts, title) {
  const file = Array.isArray(relParts) ? resolveDoc(...relParts) : resolveDoc(relParts);
  if (!fs.existsSync(file)) {
    // try workspace search
    for (const folder of workspaceFolders()) {
      const candidate = path.join(folder.uri.fsPath, "docs", ...(Array.isArray(relParts) ? relParts : [relParts]));
      if (fs.existsSync(candidate)) {
        const doc = await vscode.workspace.openTextDocument(candidate);
        await vscode.window.showTextDocument(doc, { preview: true });
        return;
      }
    }
    vscode.window.showWarningMessage(`Cachou docs not found: ${title || file}`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc, { preview: true });
}

module.exports = {
  openMarkdown,
  resolveDoc,
  packageRoot
};
