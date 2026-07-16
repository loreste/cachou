declare module "cachoujs/styles" {
  /**
   * Tagged template that creates a scoped `<style>` element, auto-injected
   * into the document head. Returns a scoping class name.
   *
   * If any interpolated value is a signal getter (function), an effect is
   * set up to reactively update the corresponding CSS custom property.
   */
  export function css(strings: TemplateStringsArray, ...values: any[]): string;

  /**
   * Bind a CSS custom property to a reactive signal on a specific element.
   *
   * @param name CSS custom property name (e.g. `"--my-color"`). A `--` prefix
   *   is added automatically if missing.
   * @param signalGetter A signal getter function that returns the value.
   * @param el Target element (defaults to `document.documentElement`).
   * @returns Cleanup function that removes the binding.
   */
  export function cssVar(
    name: string,
    signalGetter: () => any,
    el?: HTMLElement
  ): () => void;

  /** Result returned by `theme`. */
  export interface ThemeResult {
    /** Map of token names to `var(--cachou-<name>)` references. */
    vars: Record<string, string>;
    /** The generated class name to apply to a container element. */
    className: string;
    /** Apply theme to an element by adding the theme class. */
    apply(el: HTMLElement): void;
  }

  /**
   * Create a theme object from a token map. Tokens are exposed as CSS custom
   * properties prefixed with `--cachou-`.
   */
  export function theme(tokens: Record<string, string | number>): ThemeResult;

  /**
   * Inject global CSS styles once. Repeated calls with the same content are
   * de-duplicated by content hash.
   */
  export function globalCSS(cssText: string): void;

  /**
   * Conditional class name joiner (like `clsx`).
   * Accepts strings, objects `{ active: bool }`, arrays, and falsy values.
   */
  export function cx(
    ...args: Array<
      string | Record<string, boolean> | Array<any> | null | undefined | false
    >
  ): string;

  /**
   * Register a `@keyframes` animation and return the animation name.
   * Repeated calls with the same name are de-duplicated.
   *
   * @param name The animation name.
   * @param frames Keyframe map keyed by stop (e.g. `"0%"`, `"from"`, `"to"`).
   *   Values are either raw CSS strings or objects of property/value pairs.
   * @returns The animation name (same as input).
   */
  export function keyframes(
    name: string,
    frames: Record<string, string | Record<string, string>>
  ): string;
}
