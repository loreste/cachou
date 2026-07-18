/**
 * Vite plugin for compiling `.cachou` SFCs.
 * @module cachoujs/vite
 */
declare module "cachoujs/vite" {
  export interface CachouVitePluginOptions {
    /** Component directories to compile on buildStart (default: src/components, demo/components). */
    dirs?: string[];
    /** Import specifier written into generated JS (default: "cachoujs"). */
    runtime?: string;
    /** Alias `cachoujs` to the browser-safe runtime entry (default: true). */
    aliasRuntime?: boolean;
    /** Absolute path to the runtime entry used for the alias. */
    runtimeEntry?: string;
  }

  export interface ResolvedCompilerCommand {
    command: string;
    argsPrefix: string[];
    cwd: string;
  }

  export function resolveCompilerCommand(cwd?: string): ResolvedCompilerCommand;

  export function runCachouCompiler(
    args?: string[],
    options?: { cwd?: string; runtime?: string }
  ): Promise<void>;

  /** Vite plugin factory. */
  export function cachou(options?: CachouVitePluginOptions): {
    name: string;
    config?: () => any;
    configResolved?: (config: any) => void;
    buildStart?: () => Promise<void>;
    configureServer?: (server: any) => void;
  };

  export default cachou;
}
