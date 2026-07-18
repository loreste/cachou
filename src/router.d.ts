/**
 * Client router (deep import).
 * @module cachoujs/router
 */
declare module "cachoujs/router" {
  import type {
    Accessor,
    CachouChild,
    MiddlewareHandler,
    RouteLoadContext,
    RouteLoadState,
    SignalGetter
  } from "cachoujs";

  export type { MiddlewareHandler, RouteLoadContext, RouteLoadState };

  export function configureRouter(options?: {
    history?: "browser" | "hash" | "memory";
    initialPath?: string;
  }): { history: string };
  export function getHistoryMode(): string;
  export function getPath(): string;
  export function getQueryParams(): Record<string, string>;
  export function getRouteParams(): Record<string, string>;
  export function navigate(
    path: string,
    options?: { replace?: boolean; scroll?: boolean; focus?: boolean; viewTransition?: boolean }
  ): boolean;
  export function beforeNavigate(
    handler: (event: {
      from: string;
      to: string;
      replace: boolean;
      signal: AbortSignal;
    }) => boolean | void | Promise<boolean | void>
  ): () => void;
  export function guard(handler: MiddlewareHandler): () => void;
  /** @deprecated Use `guard()`. */
  export function addMiddleware(handler: MiddlewareHandler): () => void;
  export function go(delta: number): boolean;
  export function back(): boolean;
  export function forward(): boolean;
  export function matchPath(
    routePath: string,
    path: string
  ): { matches: boolean; params?: Record<string, string> };
  export function useParams(): SignalGetter<Record<string, string>>;
  export function useSearchParams(): [
    SignalGetter<Record<string, string>>,
    (
      next:
        | Record<string, any>
        | ((prev: Record<string, string>) => Record<string, any>),
      options?: { replace?: boolean; replaceAll?: boolean }
    ) => void
  ];
  export function getRouteData(): any;
  export function useRouteData<T = any>(): RouteLoadState<T>;
  export function useAction(): any;
  export function createAction(handler: (input: any, ctx?: any) => any | Promise<any>): {
    submit: (input?: any, ctx?: any) => Promise<any>;
    pending: SignalGetter<boolean>;
    error: SignalGetter<any>;
    result: SignalGetter<any>;
    Form: (props?: any) => any;
  };
  export class RedirectError extends Error {
    path: string;
    options: any;
  }
  export class NotFoundError extends Error {}
  export function redirect(path: string, options?: { replace?: boolean }): never;
  export function notFound(message?: string): never;
  export function isRedirectError(err: any): boolean;
  export function isNotFoundError(err: any): boolean;
  export function Link(props: {
    href: string;
    class?: string;
    children: any;
  }): HTMLElement;
  export function Router(props: { children: any }): HTMLElement;
  export function Route(props: {
    path: string;
    component: any;
    load?: (ctx: RouteLoadContext) => any | Promise<any>;
    fallback?: any;
    error?: any | ((err: any, retry: () => void) => any);
  }): () => any;
  export function Layout(props: {
    path: string;
    component: any;
    children?: any[] | any;
  }): () => any;
  export function Outlet(): () => any;
  export function NotFound(props?: { component?: any; children?: any }): () => any;
  export function lazy<T>(loader: () => Promise<{ default: T } | T>): T;
  export function setSSRPath(path: string): void;
}
