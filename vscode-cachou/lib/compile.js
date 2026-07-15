"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { resolveCompilerInvocation, runtimeImport } = require("./config");

/**
 * Run the Cachou compiler.
 * @param {{ file?: string, dir?: string, out?: string, cwdHint?: string }} options
 * @returns {Promise<{ code: number, stdout: string, stderr: string, combined: string, commandLine: string }>}
 */
function runCompiler(options = {}) {
  const hint = options.file || options.dir || options.cwdHint;
  const inv = resolveCompilerInvocation(hint);
  const args = [...inv.argsPrefix];

  if (options.file) {
    args.push("-file", options.file);
  }
  if (options.dir) {
    args.push("-dir", options.dir);
  }
  if (options.out) {
    args.push("-out", options.out);
  }

  const runtime = runtimeImport();
  if (runtime && !args.includes("-runtime")) {
    args.push("-runtime", runtime);
  }

  const commandLine = [inv.command, ...args].join(" ");

  return new Promise(resolve => {
    const child = spawn(inv.command, args, {
      cwd: inv.cwd,
      env: process.env,
      shell: false
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", err => {
      resolve({
        code: 1,
        stdout,
        stderr: String(err.message || err),
        combined: `${stdout}\n${stderr}\n${err.message}`,
        commandLine
      });
    });
    child.on("close", code => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        combined: `${stdout}\n${stderr}`.trim(),
        commandLine
      });
    });
  });
}

function defaultOutForFile(filePath) {
  return path.dirname(filePath);
}

module.exports = {
  runCompiler,
  defaultOutForFile
};
