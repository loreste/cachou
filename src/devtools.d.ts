/**
 * In-page DevTools panel (experimental).
 * @module cachoujs/devtools
 */
declare module "cachoujs/devtools" {
  export function mountDevtools(options?: {
    parent?: HTMLElement;
    enableDebugMode?: boolean;
    position?: string;
  }): () => void;

  export function unmountDevtools(): void;

  export function isDevtoolsOpen(): boolean;

  /** Ctrl+Shift+D toggles the panel. Returns disposer. */
  export function installDevtoolsHotkey(): () => void;
}
