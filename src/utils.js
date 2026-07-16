import { signal, effect, onCleanup } from "./reactivity.js";

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------

/**
 * Create a debounced signal getter. The returned getter only updates after the
 * source signal has been stable for `ms` milliseconds.
 *
 * @param {function} signalGetter - A signal getter function.
 * @param {number} ms - Debounce delay in milliseconds.
 * @param {{ leading?: boolean }} [options] - Options.
 * @param {boolean} [options.leading=false] - Fire on the leading edge too.
 * @returns {function} A getter that returns the debounced value.
 *
 * @example
 * ```js
 * const [search, setSearch] = signal('');
 * const debouncedSearch = debounce(search, 300);
 * effect(() => console.log(debouncedSearch()));
 * ```
 */
export function debounce(signalGetter, ms, options = {}) {
  const leading = options.leading === true;
  const [val, setVal] = signal(signalGetter());
  let isLeading = true;

  effect(() => {
    const current = signalGetter();

    if (leading && isLeading) {
      isLeading = false;
      setVal(() => current);
      return;
    }

    isLeading = false;
    const timer = setTimeout(() => setVal(() => current), ms);

    onCleanup(() => clearTimeout(timer));
  });

  return val;
}

// ---------------------------------------------------------------------------
// throttle
// ---------------------------------------------------------------------------

/**
 * Create a throttled signal getter. The returned getter updates at most once
 * per `ms` milliseconds, always emitting the latest value after the interval.
 *
 * @param {function} signalGetter - A signal getter function.
 * @param {number} ms - Throttle interval in milliseconds.
 * @returns {function} A getter that returns the throttled value.
 *
 * @example
 * ```js
 * const [scrollY, setScrollY] = signal(0);
 * const throttledY = throttle(scrollY, 100);
 * ```
 */
export function throttle(signalGetter, ms) {
  const [val, setVal] = signal(signalGetter());
  let lastFired = 0;
  let trailingTimer = null;

  effect(() => {
    const current = signalGetter();
    const now = Date.now();
    const elapsed = now - lastFired;

    if (trailingTimer !== null) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }

    if (elapsed >= ms) {
      lastFired = now;
      setVal(() => current);
    } else {
      trailingTimer = setTimeout(() => {
        lastFired = Date.now();
        setVal(() => current);
        trailingTimer = null;
      }, ms - elapsed);
    }

    onCleanup(() => {
      if (trailingTimer !== null) {
        clearTimeout(trailingTimer);
        trailingTimer = null;
      }
    });
  });

  return val;
}

// ---------------------------------------------------------------------------
// useMedia
// ---------------------------------------------------------------------------

/**
 * Reactively track whether a CSS media query matches.
 *
 * @param {string} query - A CSS media query string (e.g. `"(min-width: 768px)"`).
 * @returns {function} A boolean signal getter.
 *
 * @example
 * ```js
 * const isWide = useMedia('(min-width: 1024px)');
 * effect(() => console.log('Wide:', isWide()));
 * ```
 */
export function useMedia(query) {
  const isServer = typeof window === "undefined";
  const [matches, setMatches] = signal(
    isServer ? false : window.matchMedia(query).matches
  );

  if (!isServer) {
    effect(() => {
      const mql = window.matchMedia(query);
      setMatches(mql.matches);

      /** @param {MediaQueryListEvent} e */
      const handler = (e) => setMatches(e.matches);
      mql.addEventListener("change", handler);

      onCleanup(() => mql.removeEventListener("change", handler));
    });
  }

  return matches;
}

// ---------------------------------------------------------------------------
// useBreakpoint
// ---------------------------------------------------------------------------

/** @type {Record<string, number>} */
const defaultBreakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536
};

/**
 * Reactive breakpoint tracking. Returns an object with boolean getters for
 * each breakpoint, a `current()` getter, and a `between(min, max)` helper.
 *
 * @param {Record<string, number>} [breakpoints] - Breakpoint map. Defaults to
 *   `{ sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536 }`.
 * @returns {{ current: function, between: (min: string, max: string) => function, [name: string]: function }}
 *
 * @example
 * ```js
 * const bp = useBreakpoint();
 * effect(() => {
 *   if (bp.lg()) console.log('Large screen');
 *   console.log('Current:', bp.current());
 * });
 * ```
 */
export function useBreakpoint(breakpoints) {
  const bp = breakpoints || defaultBreakpoints;
  const sorted = Object.entries(bp).sort((a, b) => a[1] - b[1]);

  // Create media query getters for each breakpoint (>= value)
  const mediaGetters = {};
  for (const [name, px] of sorted) {
    mediaGetters[name] = useMedia(`(min-width: ${px}px)`);
  }

  /** @returns {string} Current breakpoint name. */
  const current = () => {
    let active = "xs";
    for (const [name] of sorted) {
      if (mediaGetters[name]()) active = name;
    }
    return active;
  };

  /**
   * Returns a boolean getter for a range between two breakpoints.
   * @param {string} min - Minimum breakpoint name (inclusive).
   * @param {string} max - Maximum breakpoint name (exclusive).
   * @returns {function} Boolean getter.
   */
  const between = (min, max) => {
    const minPx = bp[min];
    const maxPx = bp[max];
    if (minPx == null || maxPx == null) {
      return () => false;
    }
    return useMedia(`(min-width: ${minPx}px) and (max-width: ${maxPx - 1}px)`);
  };

  const result = { current, between };
  for (const [name] of sorted) {
    result[name] = mediaGetters[name];
  }

  return result;
}

// ---------------------------------------------------------------------------
// useColorMode
// ---------------------------------------------------------------------------

const COLOR_MODE_KEY = "cachou-color-mode";

/**
 * Manage dark/light/system/custom color modes with persistence and OS
 * preference detection.
 *
 * @param {{ initial?: string }} [options] - Options.
 * @param {string} [options.initial="system"] - Initial color mode.
 * @returns {{ mode: function, setMode: function, isDark: function, isLight: function, toggle: function }}
 *
 * @example
 * ```js
 * const { mode, isDark, toggle } = useColorMode();
 * effect(() => console.log('Dark:', isDark()));
 * toggle(); // switch between dark and light
 * ```
 */
export function useColorMode(options = {}) {
  const isServer = typeof window === "undefined";
  const prefersDark = useMedia("(prefers-color-scheme: dark)");

  // Read persisted preference or use initial
  let initial = options.initial || "system";
  if (!isServer) {
    try {
      const stored = localStorage.getItem(COLOR_MODE_KEY);
      if (stored) initial = stored;
    } catch (_) {
      // localStorage may be unavailable
    }
  }

  const [mode, setModeSignal] = signal(initial);

  /** Resolve whether dark mode is active. */
  const isDark = () => {
    const m = mode();
    if (m === "dark") return true;
    if (m === "light") return false;
    // "system" or unrecognized — follow OS
    return prefersDark();
  };

  /** Resolve whether light mode is active. */
  const isLight = () => !isDark();

  /**
   * Set the color mode. Persists to localStorage and updates the DOM.
   * @param {string} value - "dark", "light", "system", or a custom mode.
   */
  const setMode = (value) => {
    setModeSignal(value);
    if (!isServer) {
      try {
        localStorage.setItem(COLOR_MODE_KEY, value);
      } catch (_) {
        // ignore
      }
    }
  };

  /** Toggle between dark and light modes. */
  const toggle = () => {
    setMode(isDark() ? "light" : "dark");
  };

  // Apply DOM attributes reactively
  if (!isServer) {
    effect(() => {
      const dark = isDark();
      const el = document.documentElement;
      el.setAttribute("data-color-mode", mode());
      el.classList.toggle("dark", dark);
      el.classList.toggle("light", !dark);
    });
  }

  return { mode, setMode, isDark, isLight, toggle };
}

// ---------------------------------------------------------------------------
// useClipboard
// ---------------------------------------------------------------------------

/**
 * Reactive clipboard API with fallback for older browsers.
 *
 * @returns {{ copy: (text: string) => Promise<void>, copied: function, text: function }}
 *
 * @example
 * ```js
 * const { copy, copied } = useClipboard();
 * copy('hello');
 * effect(() => { if (copied()) console.log('Copied!'); });
 * ```
 */
export function useClipboard() {
  const [text, setText] = signal("");
  const [copied, setCopied] = signal(false);
  let resetTimer = null;

  /**
   * Copy text to the clipboard.
   * @param {string} value - The text to copy.
   * @returns {Promise<void>}
   */
  const copy = async (value) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== "undefined") {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setText(value);
      setCopied(true);

      if (resetTimer !== null) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        setCopied(false);
        resetTimer = null;
      }, 2000);
    } catch (_) {
      setCopied(false);
    }
  };

  return { copy, copied, text };
}

// ---------------------------------------------------------------------------
// useOnline
// ---------------------------------------------------------------------------

/**
 * Reactively track online/offline status.
 *
 * @returns {function} A boolean signal getter (true when online).
 *
 * @example
 * ```js
 * const online = useOnline();
 * effect(() => console.log('Online:', online()));
 * ```
 */
export function useOnline() {
  const isServer = typeof window === "undefined";
  const [online, setOnline] = signal(
    isServer ? true : typeof navigator !== "undefined" ? navigator.onLine : true
  );

  if (!isServer) {
    effect(() => {
      const onOnline = () => setOnline(true);
      const onOffline = () => setOnline(false);
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);

      onCleanup(() => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      });
    });
  }

  return online;
}

// ---------------------------------------------------------------------------
// useIdle
// ---------------------------------------------------------------------------

/** @type {string[]} */
const IDLE_EVENTS = ["mousemove", "keydown", "touchstart", "scroll"];

/**
 * Track user idle state. Returns `{ idle, lastActive }`.
 *
 * @param {number} [timeout=60000] - Idle timeout in milliseconds.
 * @returns {{ idle: function, lastActive: function }}
 *
 * @example
 * ```js
 * const { idle, lastActive } = useIdle(30000);
 * effect(() => { if (idle()) console.log('User is idle'); });
 * ```
 */
export function useIdle(timeout = 60000) {
  const isServer = typeof window === "undefined";
  const now = isServer ? 0 : Date.now();
  const [idle, setIdle] = signal(false);
  const [lastActive, setLastActive] = signal(now);

  if (!isServer) {
    effect(() => {
      let timer = setTimeout(() => setIdle(true), timeout);

      const onActivity = () => {
        const ts = Date.now();
        setLastActive(ts);
        setIdle(false);
        clearTimeout(timer);
        timer = setTimeout(() => setIdle(true), timeout);
      };

      for (const evt of IDLE_EVENTS) {
        document.addEventListener(evt, onActivity, { passive: true });
      }

      onCleanup(() => {
        clearTimeout(timer);
        for (const evt of IDLE_EVENTS) {
          document.removeEventListener(evt, onActivity);
        }
      });
    });
  }

  return { idle, lastActive };
}
