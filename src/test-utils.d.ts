/**
 * Testing utilities for Cachou.
 *
 * @module cachoujs/test-utils
 */
declare module "cachoujs/test-utils" {
  // -------------------------------------------------------------------------
  // renderTest
  // -------------------------------------------------------------------------

  export interface RenderOptions {
    /** Props passed to the component. */
    props?: Record<string, any>;
    /** Custom container element. */
    container?: Element;
  }

  export interface RenderResult {
    /** The container element holding the rendered component. */
    container: Element;
    /** Unmount the component and clean up reactive roots. */
    unmount(): void;
    /** Find element containing the given text. Throws if not found. */
    getByText(text: string | RegExp): Element;
    /** Find element containing the given text. Returns null if not found. */
    queryByText(text: string | RegExp): Element | null;
    /** Find element by ARIA role. Throws if not found or multiple found. */
    getByRole(role: string): Element;
    /** Find element by ARIA role. Returns null if not found. */
    queryByRole(role: string): Element | null;
    /** Find all elements matching a given ARIA role. */
    getAllByRole(role: string): Element[];
    /** Find element by `data-testid` attribute. Throws if not found. */
    getByTestId(id: string): Element;
    /** Find element by `data-testid` attribute. Returns null if not found. */
    queryByTestId(id: string): Element | null;
  }

  /**
   * Render a component into a detached DOM container for testing.
   */
  export function renderTest(
    Component: (props: any) => any,
    options?: RenderOptions
  ): RenderResult;

  // -------------------------------------------------------------------------
  // act
  // -------------------------------------------------------------------------

  /**
   * Run `fn` and flush all pending reactive updates.
   */
  export function act(fn: () => any): Promise<void>;

  // -------------------------------------------------------------------------
  // fireEvent
  // -------------------------------------------------------------------------

  export interface FireEventOptions {
    /** Properties to assign to the target element (e.g. `{ value: "hello" }`). */
    target?: Record<string, any>;
    /** Whether the event bubbles (default true). */
    bubbles?: boolean;
    /** Whether the event is cancelable (default true). */
    cancelable?: boolean;
    /** Additional event init properties. */
    [key: string]: any;
  }

  export interface FireEvent {
    /** Dispatch a click event. */
    click(el: Element, opts?: FireEventOptions): void;
    /** Dispatch an input event. */
    input(el: Element, opts?: FireEventOptions): void;
    /** Dispatch a change event. */
    change(el: Element, opts?: FireEventOptions): void;
    /** Dispatch a keydown event. */
    keydown(el: Element, opts?: FireEventOptions): void;
    /** Dispatch a keyup event. */
    keyup(el: Element, opts?: FireEventOptions): void;
    /** Dispatch a focus event and focus the element. */
    focus(el: Element, opts?: FireEventOptions): void;
    /** Dispatch a blur event and blur the element. */
    blur(el: Element, opts?: FireEventOptions): void;
    /** Dispatch a submit event. */
    submit(el: Element, opts?: FireEventOptions): void;
  }

  /**
   * Event helpers for common user interactions.
   * Each dispatches a real DOM Event on the target element.
   */
  export const fireEvent: FireEvent;

  // -------------------------------------------------------------------------
  // waitFor
  // -------------------------------------------------------------------------

  export interface WaitForOptions {
    /** Max wait time in ms (default 2000). */
    timeout?: number;
    /** Polling interval in ms (default 50). */
    interval?: number;
  }

  /**
   * Poll until an assertion passes or timeout is reached.
   */
  export function waitFor(
    assertion: () => void,
    options?: WaitForOptions
  ): Promise<void>;
}
