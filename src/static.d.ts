/**
 * Static site / pre-render helpers.
 * @module cachoujs/static
 */
declare module "cachoujs/static" {
  export function routeToFilePath(routePath: string): string;

  export type PrerenderRoute =
    | string
    | {
        path: string;
        title?: string;
        lang?: string;
        styles?: string;
        scripts?: string;
        bodyAttrs?: string;
        preload?: (args: {
          request: any;
          signal?: AbortSignal | null;
        }) => any | Promise<any>;
      };

  export interface PrerenderOptions {
    routes: PrerenderRoute[];
    title?: string | ((route: { path: string }) => string | undefined);
    lang?: string;
    styles?: string;
    scripts?: string;
    bodyAttrs?: string;
    /** Pass `false` to skip nonces (pure static hosts with no inline scripts). */
    nonce?: string | false;
    applySecurityDefaults?: boolean;
    /** Render all routes in parallel (default sequential). */
    concurrent?: boolean;
    render?: {
      preload?: (args: {
        request: any;
        signal?: AbortSignal | null;
      }) => any | Promise<any>;
      traceparent?: string;
      context?: any;
      signal?: AbortSignal | null;
    };
    request?: (routePath: string) => any;
  }

  export interface PrerenderResult {
    path: string;
    file: string;
    html: string;
    head: string;
    state: string;
    body: string;
  }

  export function prerenderRoutes(
    Component: (data?: any) => any,
    options: PrerenderOptions
  ): Promise<PrerenderResult[]>;

  export function writePrerendered(
    results: Array<{ file: string; html: string }>,
    outDir: string,
    options?: { dryRun?: boolean }
  ): Promise<Array<{ file: string; absolute: string; bytes: number }>>;

  export function prerenderToDir(
    Component: (data?: any) => any,
    options: PrerenderOptions & { outDir: string; dryRun?: boolean }
  ): Promise<{
    pages: PrerenderResult[];
    written: Array<{ file: string; absolute: string; bytes: number }>;
  }>;
}
