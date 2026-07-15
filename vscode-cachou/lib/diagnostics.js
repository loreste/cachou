"use strict";

const path = require("path");
const os = require("os");
const fs = require("fs");
const vscode = require("vscode");
const { runCompiler } = require("./compile");
const { getConfig } = require("./config");

const collection = vscode.languages.createDiagnosticCollection("cachou");
const timers = new Map();

function clearDiagnostics(uri) {
  if (uri) collection.delete(uri);
  else collection.clear();
}

/**
 * Parse compiler error output into VS Code diagnostics.
 * Supports:
 *   path: message
 *   path: template validation failed near 1:1: unclosed ...
 *   Error compiling file path: unclosed template expression at 3:5
 *   unclosed template expression at 3:5
 */
function parseDiagnostics(filePath, output) {
  const diagnostics = [];
  const text = String(output || "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const base = path.basename(filePath);

  for (const line of lines) {
    let match =
      line.match(/^(?:Error compiling file )?(.+?):\s*(.+)$/i) ||
      line.match(/^(.+?):\s*(.+)$/);

    let message = line;
    let lineNum = 0;
    let colNum = 0;
    let target = filePath;

    if (match) {
      const maybePath = match[1].trim();
      message = match[2].trim();
      if (maybePath.includes(base) || maybePath.endsWith(".cachou") || path.isAbsolute(maybePath)) {
        target = maybePath;
      } else {
        // first group was not a path — whole line is message
        message = line;
      }
    }

    const at = message.match(/(?:near|at)\s+(\d+):(\d+)/i) || message.match(/(\d+):(\d+)/);
    if (at) {
      lineNum = Math.max(0, parseInt(at[1], 10) - 1);
      colNum = Math.max(0, parseInt(at[2], 10) - 1);
    }

    // Prefer attaching to the active file
    if (path.basename(target) !== base && !text.includes(base)) {
      // still show on current file
    }

    const range = new vscode.Range(lineNum, colNum, lineNum, Math.max(colNum + 1, colNum + 20));
    const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    diag.source = "cachou";
    diagnostics.push(diag);
  }

  if (diagnostics.length === 0 && text.trim()) {
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        text.trim().slice(0, 500),
        vscode.DiagnosticSeverity.Error
      )
    );
  }

  return diagnostics;
}

async function lintFile(doc) {
  if (!doc || doc.languageId !== "cachou") return;
  if (!getConfig().get("diagnostics")) {
    clearDiagnostics(doc.uri);
    return;
  }

  // Write unsaved buffer to a temp file so diagnostics match editor content
  const original = doc.uri.fsPath;
  let compilePath = original;
  let tempPath = null;

  try {
    if (doc.isDirty) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cachou-vscode-"));
      tempPath = path.join(dir, path.basename(original) || "buffer.cachou");
      fs.writeFileSync(tempPath, doc.getText(), "utf8");
      compilePath = tempPath;
    }

    const outDir = tempPath
      ? path.dirname(tempPath)
      : path.join(os.tmpdir(), "cachou-vscode-out");
    if (!tempPath) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const result = await runCompiler({
      file: compilePath,
      out: outDir,
      cwdHint: original
    });

    if (result.code === 0) {
      clearDiagnostics(doc.uri);
      return;
    }

    // Rewrite temp paths in message back to the real file
    let output = result.combined;
    if (tempPath) {
      output = output.split(tempPath).join(original);
    }
    const diagnostics = parseDiagnostics(original, output);
    collection.set(doc.uri, diagnostics);
  } catch (err) {
    collection.set(doc.uri, [
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        `Cachou diagnostics failed: ${err.message || err}`,
        vscode.DiagnosticSeverity.Warning
      )
    ]);
  } finally {
    if (tempPath) {
      try {
        fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

function scheduleLint(doc) {
  if (!doc || doc.languageId !== "cachou") return;
  const key = doc.uri.toString();
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  const ms = getConfig().get("diagnosticsDebounceMs") ?? 400;
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      lintFile(doc);
    }, ms)
  );
}

function registerDiagnostics(context) {
  context.subscriptions.push(collection);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.languageId === "cachou") lintFile(doc);
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId === "cachou") scheduleLint(e.document);
    }),
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.languageId === "cachou") lintFile(doc);
    }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      clearDiagnostics(doc.uri);
    })
  );

  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "cachou") lintFile(doc);
  }

  return {
    lintFile,
    clearDiagnostics,
    collection
  };
}

module.exports = {
  registerDiagnostics,
  lintFile,
  clearDiagnostics,
  parseDiagnostics
};
