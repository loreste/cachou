/**
 * File-based route helpers.
 * @module cachoujs/file-routes
 */
declare module "cachoujs/file-routes" {
  export function filePathToRoutePath(
    filePath: string,
    options?: { routesDir?: string }
  ): string;
  export function normalizeGlobModules(
    globMap: Record<string, any>,
    options?: { routesDir?: string }
  ): Array<{
    key: string;
    loader: any;
    isLayout: boolean;
    path: string;
    depth: number;
  }>;
  export function createFileRoutes(
    modules: Record<string, any>,
    options?: { notFound?: any }
  ): any[];
  export function createFileRoutesFromGlob(
    globMap: Record<string, () => Promise<any>>,
    options?: {
      notFound?: any;
      eager?: boolean;
      modules?: Record<string, any>;
    }
  ): any[];
  export function fileRoutes(
    globMap: Record<string, () => Promise<any>>,
    options?: { notFound?: any }
  ): any[];
}
