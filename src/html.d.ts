/**
 * Templates, mount/hydrate, SSR string/stream (deep import).
 * @module cachoujs/html
 */
declare module "cachoujs/html" {
  import type { Component, SSRContext } from "cachoujs";

  export function html(
    strings: TemplateStringsArray,
    ...values: any[]
  ): HTMLElement | HTMLElement[];
  export function htmlStatic(
    markup: string
  ): HTMLElement | HTMLElement[] | DocumentFragment;
  export function createCompiledStatic(
    markup: string,
    factory?: () => Node | DocumentFragment
  ): any;
  export function hydrate(Component: () => any, root: HTMLElement): void;
  export function render(Component: () => any, root: HTMLElement): void;
  export function mount(Component: () => any, root: HTMLElement): () => void;
  export function unmount(root: HTMLElement): void;
  export function renderToString(
    Component: () => any,
    options?: {
      path?: string;
      request?: any;
      traceparent?: string;
      context?: SSRContext;
    }
  ): string;
  export function renderToStringAsync(
    Component: (data?: any) => any,
    options?: {
      path?: string;
      request?: any;
      signal?: AbortSignal;
      traceparent?: string;
      context?: SSRContext;
      preload?: (context: {
        request: any;
        signal: AbortSignal | null;
      }) => any | Promise<any>;
    }
  ): Promise<string>;
  export function renderToStream(
    Component: (data?: any) => any,
    options?: {
      path?: string;
      request?: any;
      signal?: AbortSignal;
      shell?: boolean;
      progressive?: boolean;
      nonce?: string;
      traceparent?: string;
      context?: SSRContext;
      preload?: (context: {
        request: any;
        signal: AbortSignal | null;
      }) => any | Promise<any>;
    }
  ): ReadableStream | AsyncGenerator<string>;
  export function Island(props: {
    hydrate?: "load" | "idle" | "visible" | "false" | false;
    id?: string;
    fallback?: any;
    children?: any;
  }): any;
  export function hydrateIslands(
    root?: ParentNode | null,
    ComponentMap?: Record<string, any>,
    options?: {
      onError?: (err: Error, id: string, node: Element) => void;
      rootMargin?: string;
    }
  ): () => void;
  export function trustedHTML(value: string): any;
  export function configureSecurityPolicy(options?: {
    allowedURLProtocols?: string[];
    allowedDataMimeTypes?: string[];
    allowInlineStyles?: boolean;
  }): {
    allowedURLProtocols: string[];
    allowedDataMimeTypes: string[];
    allowInlineStyles: boolean;
  };
  export function getSecurityPolicy(): {
    allowedURLProtocols: string[];
    allowedDataMimeTypes: string[];
    allowInlineStyles: boolean;
  };
  export function applyProductionSecurityDefaults(): ReturnType<
    typeof configureSecurityPolicy
  >;
  export function addNodeCleanup(node: Node, cleanup: () => void): void;
  export function cleanupNode(node: Node): void;
}
