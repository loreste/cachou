declare module "cachoujs/utils" {
  import type { SignalGetter } from "cachoujs";

  /**
   * Create a debounced signal getter. The returned getter only updates after
   * the source signal has been stable for `ms` milliseconds.
   */
  export function debounce<T>(
    signalGetter: SignalGetter<T>,
    ms: number,
    options?: { leading?: boolean }
  ): SignalGetter<T>;

  /**
   * Create a throttled signal getter. The returned getter updates at most
   * once per `ms` milliseconds, always emitting the latest value after the interval.
   */
  export function throttle<T>(
    signalGetter: SignalGetter<T>,
    ms: number
  ): SignalGetter<T>;

  /**
   * Reactively track whether a CSS media query matches.
   */
  export function useMedia(query: string): SignalGetter<boolean>;

  /** Result returned by `useBreakpoint`. */
  export interface BreakpointResult {
    /** Getter returning the name of the currently active breakpoint. */
    current: SignalGetter<string>;
    /**
     * Returns a boolean getter that is `true` when the viewport width is
     * between the `min` breakpoint (inclusive) and `max` breakpoint (exclusive).
     */
    between(min: string, max: string): SignalGetter<boolean>;
    /** Dynamic boolean getters for each breakpoint name (e.g. `bp.lg()`). */
    [name: string]: SignalGetter<boolean> | ((...args: any[]) => any);
  }

  /**
   * Reactive breakpoint tracking.
   * @param breakpoints Breakpoint map (default `{ sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536 }`).
   */
  export function useBreakpoint(
    breakpoints?: Record<string, number>
  ): BreakpointResult;

  /** Result returned by `useColorMode`. */
  export interface ColorModeResult {
    /** Getter returning the current mode string (`"dark"`, `"light"`, `"system"`, etc.). */
    mode: SignalGetter<string>;
    /** Set the color mode. Persists to `localStorage` and updates the DOM. */
    setMode(value: string): void;
    /** Getter: `true` when dark mode is active (resolves `"system"` via OS preference). */
    isDark: SignalGetter<boolean>;
    /** Getter: `true` when light mode is active. */
    isLight: SignalGetter<boolean>;
    /** Toggle between dark and light modes. */
    toggle(): void;
  }

  /**
   * Manage dark/light/system/custom color modes with persistence and OS
   * preference detection.
   */
  export function useColorMode(options?: {
    /** Initial color mode (default `"system"`). */
    initial?: string;
  }): ColorModeResult;

  /** Result returned by `useClipboard`. */
  export interface ClipboardResult {
    /** Copy text to the clipboard. */
    copy(text: string): Promise<void>;
    /** Getter: `true` for ~2 seconds after a successful copy. */
    copied: SignalGetter<boolean>;
    /** Getter returning the last copied text. */
    text: SignalGetter<string>;
  }

  /**
   * Reactive clipboard API with fallback for older browsers.
   */
  export function useClipboard(): ClipboardResult;

  /**
   * Reactively track online/offline status.
   * @returns A boolean signal getter (`true` when online).
   */
  export function useOnline(): SignalGetter<boolean>;

  /** Result returned by `useIdle`. */
  export interface IdleResult {
    /** Getter: `true` when the user has been idle for the configured timeout. */
    idle: SignalGetter<boolean>;
    /** Getter returning the timestamp of the last user activity. */
    lastActive: SignalGetter<number>;
  }

  /**
   * Track user idle state.
   * @param timeout Idle timeout in milliseconds (default `60000`).
   */
  export function useIdle(timeout?: number): IdleResult;
}
