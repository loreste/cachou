import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

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

const candidates = [
  { command: join(root, "bin", "cachou-compiler"), args: userArgs, shell: false },
  { command: join(root, "bin", "dist", platformBinaryName()), args: userArgs, shell: false },
  {
    command: process.execPath,
    args: [join(root, "packages", "compiler", "bin", "cachou-compiler.js"), ...userArgs],
    shell: false
  },
  { command: "go", args: ["run", join(root, "compiler.go"), ...userArgs], shell: false }
];

function pick() {
  for (const c of candidates) {
    if (c.command === "go" || c.command === process.execPath) {
      if (c.command === process.execPath) {
        if (existsSync(c.args[0])) return c;
      } else {
        return c;
      }
    } else if (existsSync(c.command)) {
      return c;
    }
  }
  return candidates[candidates.length - 1];
}

const inv = pick();
const child = spawn(inv.command, inv.args, {
  stdio: "inherit",
  cwd: root
});

child.on("error", err => {
  if (err.code === "ENOENT") {
    console.error(
      "Cachou compiler not found.\n" +
        "The pure JS compiler should be at packages/compiler.\n" +
        "Or install Go and run: npm run compiler:build"
    );
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});

child.on("close", code => {
  process.exit(code ?? 1);
});
