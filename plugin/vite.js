import { execFile } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const pluginRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(pluginRoot, "..");

/**
 * Resolve the Cachou compiler binary or fall back to `go run`.
 */
export function resolveCompilerCommand(cwd = process.cwd()) {
  const localBin = join(cwd, "bin", "cachou-compiler");
  const packageBin = join(packageRoot, "bin", "cachou-compiler");
  if (existsSync(localBin)) {
    return { command: localBin, argsPrefix: [], cwd };
  }
  if (existsSync(packageBin)) {
    return { command: packageBin, argsPrefix: [], cwd };
  }
  return {
    command: "go",
    argsPrefix: ["run", join(packageRoot, "compiler.go")],
    cwd: packageRoot
  };
}

export async function runCachouCompiler(args = [], options = {}) {
  const { command, argsPrefix, cwd } = resolveCompilerCommand(options.cwd || process.cwd());
  const fullArgs = [
    ...argsPrefix,
    ...args,
    ...(options.runtime ? ["-runtime", options.runtime] : [])
  ];
  try {
    const { stdout, stderr } = await execFileAsync(command, fullArgs, {
      cwd,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024
    });
    if (stdout?.trim()) console.log(`⚡ [CachouJS Compiler]: ${stdout.trim()}`);
    if (stderr?.trim()) console.warn(stderr.trim());
  } catch (err) {
    const message = err.stderr || err.stdout || err.message;
    throw new Error(`Cachou compiler failed: ${message}`);
  }
}

/**
 * Vite plugin for compiling `.cachou` single-file components.
 *
 * @param {object} [options]
 * @param {string[]} [options.dirs] Component directories to compile on buildStart
 * @param {string} [options.runtime="cachoujs"] Import specifier written into generated JS
 * @param {boolean} [options.aliasRuntime=true] Alias `cachoujs` to this package's src in the consumer project
 */
export function cachou(options = {}) {
  const componentDirs = options.dirs || ["src/components", "demo/components"];
  const runtime = options.runtime || "cachoujs";
  const aliasRuntime = options.aliasRuntime !== false;
  let root = process.cwd();

  return {
    name: "vite-plugin-cachou",
    config() {
      if (!aliasRuntime) return;
      return {
        resolve: {
          alias: {
            cachoujs: resolve(packageRoot, "src", "index.js")
          }
        }
      };
    },
    configResolved(config) {
      root = config.root;
    },
    async buildStart() {
      console.log("⚡ [CachouJS Plugin] Compiling components...");
      for (const dir of componentDirs) {
        const abs = resolve(root, dir);
        if (!existsSync(abs)) continue;
        await runCachouCompiler(["-dir", abs, "-out", abs, "-runtime", runtime], {
          cwd: packageRoot,
          runtime
        });
      }
    },
    configureServer(server) {
      const onComponentChange = async file => {
        if (!file.endsWith(".cachou")) return;
        const outDir = dirname(file);
        console.log(`⚡ [CachouJS Plugin] Sync compile: ${relative(root, file)}`);
        try {
          await runCachouCompiler(["-file", file, "-out", outDir, "-runtime", runtime], {
            cwd: packageRoot,
            runtime
          });
          server.ws.send({ type: "full-reload", path: "*" });
        } catch (err) {
          console.error(`⚡ [CachouJS Plugin] Recompilation failed: ${err.message}`);
          server.ws.send({
            type: "error",
            err: { message: err.message, stack: err.stack }
          });
        }
      };

      server.watcher.on("change", onComponentChange);
      server.watcher.on("add", onComponentChange);
      server.watcher.on("unlink", file => {
        if (!file.endsWith(".cachou")) return;
        const compiledJs = file.replace(/\.cachou$/, ".js");
        const compiledCss = file.replace(/\.cachou$/, ".css");
        for (const generated of [compiledJs, compiledCss]) {
          if (existsSync(generated)) {
            unlinkSync(generated);
          }
        }
        server.ws.send({ type: "full-reload", path: "*" });
      });
    }
  };
}

export default cachou;
