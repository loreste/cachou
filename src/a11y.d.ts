/**
 * Accessibility primitives.
 * @module cachoujs/a11y
 */
declare module "cachoujs/a11y" {
  import type { Accessor, CachouChild, MaybeAccessor } from "cachoujs";

  export function focusFirst(root: ParentNode): boolean;
  export function restoreFocusAfter<T>(fn: () => T): T;
  export function trapFocus(root: HTMLElement): () => void;
  export function createLiveRegion(options?: {
    assertive?: boolean;
  }): [(message: string) => void, HTMLElement | null];
  export function Dialog(props: {
    open: MaybeAccessor<boolean>;
    onClose?: () => void;
    title?: string;
    children?: CachouChild;
    modal?: boolean;
  }): Accessor<CachouChild>;
}
