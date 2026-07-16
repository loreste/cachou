/**
 * Keyboard shortcut utilities for Cachou.
 *
 * @module cachoujs/keys
 */
declare module "cachoujs/keys" {
  /** A signal getter that returns the current value of type T. */
  type SignalGetter<T> = () => T;

  export interface HotkeyOptions {
    /** Only fire when focus is within this element. */
    scope?: HTMLElement;
    /** Call preventDefault on matching events (default true). */
    prevent?: boolean;
  }

  /**
   * Register a global keyboard shortcut. Returns a dispose function.
   *
   * Supports modifier keys (`mod`, `ctrl`, `shift`, `alt`, `meta`),
   * chord sequences (`"g then d"`), and scoped shortcuts.
   *
   * `mod` maps to Cmd on Mac and Ctrl elsewhere.
   *
   * @param combo - Key combination, e.g. `"mod+k"`, `"ctrl+shift+a"`, `"g then d"`
   * @param handler - Callback invoked when the shortcut is triggered.
   * @param options - Optional configuration.
   * @returns Dispose function to remove the listener.
   */
  export function hotkey(
    combo: string,
    handler: (event: KeyboardEvent) => void,
    options?: HotkeyOptions
  ): () => void;

  /**
   * Returns a reactive signal getter that is `true` while the specified key is held down.
   *
   * @param key - Key name, e.g. `"shift"`, `"control"`, `"alt"`, `"meta"`, or any `KeyboardEvent.key` value.
   * @returns Signal getter -- `true` while the key is held.
   */
  export function holdKey(key: string): SignalGetter<boolean>;
}
