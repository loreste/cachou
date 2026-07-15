"use strict";

const path = require("path");
const fs = require("fs");
const vscode = require("vscode");

function getConfig() {
  return vscode.workspace.getConfiguration("cachou");
}

function workspaceFolders() {
  return vscode.workspace.workspaceFolders || [];
}

/**
 * Resolve the monorepo / package root that contains the Cachou compiler.
 */
function findPackageRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    const pkg = path.join(dir, "package.json");
    const compiler = path.join(dir, "compiler.go");
    const runCompiler = path.join(dir, "scripts", "run-compiler.mjs");
    if (fs.existsSync(pkg)) {
      try {
        const json = JSON.parse(fs.readFileSync(pkg, "utf8"));
        if (json.name === "cachoujs" || fs.existsSync(compiler) || fs.existsSync(runCompiler)) {
          return dir;
        }
      } catch {
        // continue
      }
    }
    if (fs.existsSync(compiler) && fs.existsSync(runCompiler)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveFromWorkspace() {
  for (const folder of workspaceFolders()) {
    const root = findPackageRoot(folder.uri.fsPath);
    if (root) return root;
  }
  return workspaceFolders()[0]?.uri.fsPath || process.cwd();
}

/**
 * @returns {{ command: string, argsPrefix: string[], cwd: string, label: string }}
 */
function resolveCompilerInvocation(filePath) {
  const config = getConfig();
  const configured = (config.get("compilerPath") || "").trim();
  const start = filePath ? path.dirname(filePath) : resolveFromWorkspace();
  const packageRoot = findPackageRoot(start) || resolveFromWorkspace();

  if (configured) {
    const abs = path.isAbsolute(configured)
      ? configured
      : path.join(packageRoot, configured);
    if (abs.endsWith(".mjs") || abs.endsWith(".js")) {
      return { command: process.execPath, argsPrefix: [abs], cwd: packageRoot, label: abs };
    }
    return { command: abs, argsPrefix: [], cwd: packageRoot, label: abs };
  }

  const nativeBin = path.join(packageRoot, "bin", "cachou-compiler");
  const wrapper = path.join(packageRoot, "bin", "cachou-compiler-wrapper.mjs");
  const runScript = path.join(packageRoot, "scripts", "run-compiler.mjs");
  const compilerGo = path.join(packageRoot, "compiler.go");

  if (fs.existsSync(nativeBin)) {
    return { command: nativeBin, argsPrefix: [], cwd: packageRoot, label: nativeBin };
  }
  if (fs.existsSync(wrapper)) {
    return {
      command: process.execPath,
      argsPrefix: [wrapper],
      cwd: packageRoot,
      label: wrapper
    };
  }
  if (fs.existsSync(runScript)) {
    return {
      command: process.execPath,
      argsPrefix: [runScript],
      cwd: packageRoot,
      label: runScript
    };
  }
  if (fs.existsSync(compilerGo)) {
    return {
      command: "go",
      argsPrefix: ["run", compilerGo],
      cwd: packageRoot,
      label: "go run compiler.go"
    };
  }

  // Fallback: npx from PATH (published package)
  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    argsPrefix: ["--yes", "cachou-compiler"],
    cwd: packageRoot,
    label: "npx cachou-compiler"
  };
}

function runtimeImport() {
  return getConfig().get("runtime") || "cachoujs";
}

function componentDirs() {
  return getConfig().get("componentDirs") || [];
}

function docsPath() {
  return getConfig().get("docsPath") || "docs";
}

module.exports = {
  getConfig,
  workspaceFolders,
  findPackageRoot,
  resolveFromWorkspace,
  resolveCompilerInvocation,
  runtimeImport,
  componentDirs,
  docsPath
};
