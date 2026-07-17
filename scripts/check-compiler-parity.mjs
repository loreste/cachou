import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "tests", "compiler-fixtures");
const jsCompiler = join(root, "packages", "compiler", "bin", "cachou-compiler.js");
const nativeCompiler = join(root, "bin", `cachou-compiler${process.platform === "win32" ? ".exe" : ""}`);

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files.sort();
}

function runCompiler(command, args) {
  const env = { ...process.env };
  delete env.CACHOU_COMPILER_LEGACY;
  try {
    execFileSync(command, args, { cwd: root, env, stdio: "pipe", encoding: "utf8" });
  } catch (error) {
    const stdout = error.stdout ? String(error.stdout) : "";
    const stderr = error.stderr ? String(error.stderr) : "";
    throw new Error(`${command} failed (${error.status ?? "start"})\n${stdout}${stderr}`);
  }
}

function compareTrees(leftRoot, rightRoot) {
  const leftFiles = listFiles(leftRoot).map(path => relative(leftRoot, path));
  const rightFiles = listFiles(rightRoot).map(path => relative(rightRoot, path));
  if (leftFiles.join("\n") !== rightFiles.join("\n")) {
    throw new Error(`compiler parity file list mismatch:\nJS: ${leftFiles.join(", ")}\nGo: ${rightFiles.join(", ")}`);
  }
  for (const file of leftFiles) {
    const left = readFileSync(join(leftRoot, file));
    const right = readFileSync(join(rightRoot, file));
    if (!left.equals(right)) {
      throw new Error(`compiler parity mismatch in ${file}`);
    }
  }
}

const temporaryRoot = mkdtempSync(join(root, ".cachou-compiler-parity-"));
const jsOut = join(temporaryRoot, "js");
const goOut = join(temporaryRoot, "go");
try {
  runCompiler(process.execPath, [jsCompiler, "-dir", fixtures, "-out", jsOut, "-runtime", "cachoujs"]);
  runCompiler(nativeCompiler, ["-dir", fixtures, "-out", goOut, "-runtime", "cachoujs"]);
  compareTrees(jsOut, goOut);
  console.log(`Compiler parity passed (${listFiles(jsOut).length} generated files).`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
