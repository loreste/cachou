/**
 * Internationalization utilities for Cachou.
 *
 * @module cachoujs/i18n
 */
declare module "cachoujs/i18n" {
  /** A signal getter that returns the current value of type T. */
  type SignalGetter<T> = () => T;

  export interface I18nConfig {
    /** Initial locale. */
    defaultLocale: string;
    /** Locale to fall back to when a key is missing. */
    fallbackLocale?: string;
    /** Pre-loaded translation messages keyed by locale. */
    messages?: Record<string, Record<string, any>>;
  }

  export interface I18nInstance {
    /**
     * Translate a key with optional interpolation and pluralization.
     *
     * Reads the current locale reactively so translations update
     * automatically when the locale changes.
     *
     * Supports dot-notation keys (e.g. "nav.home") and pipe-separated
     * plural forms (e.g. "one item | {count} items").
     * Pass `count` in params for pluralization.
     *
     * @param key - Translation key.
     * @param params - Interpolation parameters.
     */
    t(key: string, params?: Record<string, string | number>): string;

    /** Signal getter for the current locale. */
    locale: SignalGetter<string>;

    /** Change the active locale. */
    setLocale(locale: string): void;

    /**
     * Lazy-load translations for a locale.
     *
     * @param locale - Locale identifier.
     * @param loader - Async function that returns the messages object.
     */
    loadLocale(locale: string, loader: () => Promise<Record<string, string>>): Promise<void>;

    /** Locale-aware number formatting via Intl.NumberFormat. */
    formatNumber(num: number, options?: Intl.NumberFormatOptions): string;

    /** Locale-aware date formatting via Intl.DateTimeFormat. */
    formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string;

    /** Relative time formatting ("2 hours ago", "in 3 days") via Intl.RelativeTimeFormat. */
    formatRelative(date: Date): string;
  }

  /**
   * Create a reactive internationalization instance.
   */
  export function createI18n(config: I18nConfig): I18nInstance;
}
