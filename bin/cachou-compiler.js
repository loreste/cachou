#!/usr/bin/env node
/**
 * Compiler launcher:
 * 1. Native bin/cachou-compiler (Go build)
 * 2. Platform binary in bin/dist/
 * 3. Pure JS packages/compiler
 * 4. go run compiler.go
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const userArgs = process.argv.slice(2);

if (!userArgs.includes("-runtime") && !userArgs.some(a => a.startsWith("-runtime="))) {
  userArgs.push("-runtime", "cachoujs");
}

function platformBinaryName() {
  const goos = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
  const goarch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch;
  const ext = goos === "windows" ? ".exe" : "";
  return `cachou-compiler-${goos}-${goarch}${ext}`;
}

function pick() {
  const native = join(root, "bin", "cachou-compiler");
  if (existsSync(native)) {
    return { command: native, args: userArgs };
  }
  const dist = join(root, "bin", "dist", platformBinaryName());
  if (existsSync(dist)) {
    return { command: dist, args: userArgs };
  }
  const jsCompiler = join(root, "packages", "compiler", "bin", "cachou-compiler.js");
  if (existsSync(jsCompiler)) {
    return { command: process.execPath, args: [jsCompiler, ...userArgs] };
  }
  return { command: "go", args: ["run", join(root, "compiler.go"), ...userArgs] };
}

const inv = pick();
const child = spawn(inv.command, inv.args, { stdio: "inherit", cwd: root });
child.on("error", err => {
  if (err.code === "ENOENT") {
    const jsCompiler = join(root, "packages", "compiler", "bin", "cachou-compiler.js");
    if (existsSync(jsCompiler) && inv.command !== process.execPath) {
      const fb = spawn(process.execPath, [jsCompiler, ...userArgs], { stdio: "inherit", cwd: root });
      fb.on("close", code => process.exit(code ?? 1));
      return;
    }
    console.error(
      "Cachou compiler failed to start.\n" +
        "Use the JS compiler at packages/compiler or install Go and run npm run compiler:build."
    );
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});
child.on("close", code => process.exit(code ?? 1));
