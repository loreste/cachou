#!/usr/bin/env node
/**
 * Compiler launcher (consumer-friendly defaults):
 * 1. Pure JS packages/compiler (canonical — always preferred by default)
 * 2. Optional native bin/cachou-compiler or bin/dist/* when CACHOU_COMPILER_NATIVE=1
 * 3. go run compiler.go (monorepo last resort)
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const userArgs = process.argv.slice(2);
const preferNative = process.env.CACHOU_COMPILER_NATIVE === "1";

if (!userArgs.includes("-runtime") && !userArgs.some(a => a.startsWith("-runtime="))) {
  userArgs.push("-runtime", "cachoujs");
}

function platformBinaryName() {
  const goos = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
  const goarch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch;
  const ext = goos === "windows" ? ".exe" : "";
  return `cachou-compiler-${goos}-${goarch}${ext}`;
}

function jsCompilerInvocation() {
  const jsCompiler = join(root, "packages", "compiler", "bin", "cachou-compiler.js");
  if (existsSync(jsCompiler)) {
    return { command: process.execPath, args: [jsCompiler, ...userArgs] };
  }
  return null;
}

function nativeInvocation() {
  const native = join(root, "bin", "cachou-compiler");
  if (existsSync(native)) {
    return { command: native, args: userArgs };
  }
  const dist = join(root, "bin", "dist", platformBinaryName());
  if (existsSync(dist)) {
    return { command: dist, args: userArgs };
  }
  return null;
}

function pick() {
  const js = jsCompilerInvocation();
  if (!preferNative && js) return js;

  const native = nativeInvocation();
  if (preferNative && native) return native;
  if (preferNative && js) return js;
  if (js) return js;
  if (native) return native;

  return { command: "go", args: ["run", join(root, "compiler.go"), ...userArgs] };
}

const inv = pick();
const child = spawn(inv.command, inv.args, { stdio: "inherit", cwd: root });
child.on("error", err => {
  if (err.code === "ENOENT") {
    const js = jsCompilerInvocation();
    if (js && inv.command !== process.execPath) {
      const fb = spawn(js.command, js.args, { stdio: "inherit", cwd: root });
      fb.on("close", code => process.exit(code ?? 1));
      return;
    }
    console.error(
      "Cachou compiler failed to start.\n" +
        "Install the pure JS compiler: npm install -D @cachoujs/compiler\n" +
        "Optional native launchers: npm run compiler:build:multiarch (set CACHOU_COMPILER_NATIVE=1)."
    );
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});
child.on("close", code => process.exit(code ?? 1));
