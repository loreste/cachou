declare module "cachoujs/transitions" {
  // ---------------------------------------------------------------------------
  // Easing functions
  // ---------------------------------------------------------------------------

  /** Linear easing (identity). */
  export const linear: (t: number) => number;
  /** Quadratic ease-in. */
  export const easeIn: (t: number) => number;
  /** Quadratic ease-out. */
  export const easeOut: (t: number) => number;
  /** Quadratic ease-in-out. */
  export const easeInOut: (t: number) => number;

  /** Create a cubic-bezier easing function. */
  export function cubicBezier(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): (t: number) => number;

  /** Easing function type. */
  export type EasingFn = (t: number) => number;

  // ---------------------------------------------------------------------------
  // Common types
  // ---------------------------------------------------------------------------

  /** Handle returned by `enter()` and `leave()` calls. */
  export interface TransitionHandle {
    /** Resolves when the animation finishes. */
    finished: Promise<void>;
    /** Cancel the running animation. */
    cancel(): void;
  }

  /** Object returned by transition factories (`fade`, `slide`, `fly`, `scale`). */
  export interface TransitionResult {
    /** Start the enter animation. */
    enter(): TransitionHandle;
    /** Start the leave animation. */
    leave(): TransitionHandle;
    /** Cancel any running animation and clean up inline styles. */
    destroy(): void;
  }

  // ---------------------------------------------------------------------------
  // Base transition options
  // ---------------------------------------------------------------------------

  export interface BaseTransitionOptions {
    /** Animation duration in milliseconds (default `300`). */
    duration?: number;
    /** Delay before starting in milliseconds (default `0`). */
    delay?: number;
    /** Easing function (default `easeOut`). */
    easing?: EasingFn;
    /** Called when the animation starts (after delay). */
    onStart?: () => void;
    /** Called when the animation finishes. */
    onEnd?: () => void;
  }

  // ---------------------------------------------------------------------------
  // Transition factories
  // ---------------------------------------------------------------------------

  /** Fade transition options. */
  export interface FadeOptions extends BaseTransitionOptions {}

  /** Fade transition -- opacity 0 to 1 on enter, 1 to 0 on leave. */
  export function fade(node: HTMLElement, options?: FadeOptions): TransitionResult;

  /** Slide transition options. */
  export interface SlideOptions extends BaseTransitionOptions {
    /** Slide axis: `"y"` (height, default) or `"x"` (width). */
    axis?: "y" | "x";
  }

  /** Slide transition -- slide in/out using height or width with overflow hidden. */
  export function slide(node: HTMLElement, options?: SlideOptions): TransitionResult;

  /** Fly transition options. */
  export interface FlyOptions extends BaseTransitionOptions {
    /** Horizontal offset in pixels (default `0`). */
    x?: number;
    /** Vertical offset in pixels (default `-20`). */
    y?: number;
  }

  /** Fly transition -- translate + opacity. */
  export function fly(node: HTMLElement, options?: FlyOptions): TransitionResult;

  /** Scale transition options. */
  export interface ScaleOptions extends BaseTransitionOptions {
    /** Starting scale factor (default `0`). */
    start?: number;
  }

  /** Scale transition -- scale transform + opacity. */
  export function scale(node: HTMLElement, options?: ScaleOptions): TransitionResult;

  // ---------------------------------------------------------------------------
  // swap (crossfade / FLIP)
  // ---------------------------------------------------------------------------

  /** Options for `swap`. */
  export interface SwapOptions extends BaseTransitionOptions {
    /** Fallback transition factory used when no matching pair is found. */
    fallback?: (node: HTMLElement) => TransitionResult;
  }

  /** A send or receive function produced by `swap`. */
  export type SwapFn = (
    node: HTMLElement,
    opts?: { key: any }
  ) => TransitionHandle | Promise<TransitionHandle>;

  /**
   * Create a `[send, receive]` pair for FLIP-style transitions between locations.
   * Elements are matched by a `key` property in the options.
   */
  export function swap(options?: SwapOptions): [send: SwapFn, receive: SwapFn];

  // ---------------------------------------------------------------------------
  // transition directive
  // ---------------------------------------------------------------------------

  /**
   * High-level transition directive. Automatically runs `enter` on mount and
   * registers `leave` for unmount. Works as a `use:` directive.
   *
   * @param node Target DOM element.
   * @param transitionFn A transition factory (e.g. `fade`, `slide`).
   * @param options Options passed to the transition function.
   * @returns Cleanup function.
   */
  export function transition(
    node: HTMLElement,
    transitionFn: (node: HTMLElement, options?: any) => TransitionResult,
    options?: Record<string, any>
  ): () => void;

  // ---------------------------------------------------------------------------
  // defineTransition
  // ---------------------------------------------------------------------------

  /**
   * Create a custom transition from explicit enter/leave functions.
   */
  export function defineTransition(
    enterFn: (node: HTMLElement, opts: Record<string, any>) => TransitionHandle,
    leaveFn: (node: HTMLElement, opts: Record<string, any>) => TransitionHandle
  ): (node: HTMLElement, options?: Record<string, any>) => TransitionResult;
}
