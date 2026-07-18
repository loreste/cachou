/**
 * Fetch-API SSR adapters (Workers, Deno, Bun, …).
 * @module cachoujs/ssr-adapters
 */
declare module "cachoujs/ssr-adapters" {
  export function toReadableStream(
    stream: ReadableStream | AsyncGenerator<any> | AsyncIterable<any> | null | undefined
  ): ReadableStream | null;

  export function buildResponseHeaders(
    securityHeaders?: Record<string, string>,
    extra?: Record<string, string>
  ): Headers;

  export function requestPath(request: Request | { url?: string }): string;

  export interface FetchSSROptions {
    title?: string;
    lang?: string;
    styles?: string;
    scripts?: string;
    bodyAttrs?: string;
    nonce?: string;
    stream?: boolean;
    status?: number;
    headers?: Record<string, string>;
    security?: {
      nonce?: string;
      allowInlineStyles?: boolean;
      allowInlineScripts?: boolean;
      connectSrc?: string[];
      imgSrc?: string[];
      extraDirectives?: string[];
      includeCOOP?: boolean;
    };
    applySecurityDefaults?: boolean;
    path?: string;
    preload?: (args: {
      request: any;
      signal?: AbortSignal | null;
    }) => any | Promise<any>;
    traceparent?: string;
    context?: any;
    signal?: AbortSignal | null;
    onError?: (err: Error, request: Request) => Response | Promise<Response>;
  }

  export function handleFetchRequest(
    Component: (data?: any) => any,
    request: Request,
    options?: FetchSSROptions
  ): Promise<Response>;

  export function createFetchHandler(
    Component: (data?: any) => any,
    options?: FetchSSROptions
  ): (request: Request) => Promise<Response>;
}
