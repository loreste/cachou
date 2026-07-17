import { signal, effect, batch } from "./reactivity.js";

/**
 * @typedef {Object} I18nConfig
 * @property {string} defaultLocale - Initial locale
 * @property {string} [fallbackLocale] - Locale to fall back to when a key is missing
 * @property {Record<string, Record<string, string>>} [messages] - Pre-loaded translation messages
 */

/**
 * @typedef {Object} I18nInstance
 * @property {(key: string, params?: Record<string, string|number>) => string} t - Translate a key with interpolation and pluralization
 * @property {() => string} locale - Signal getter for the current locale
 * @property {(locale: string) => void} setLocale - Change the active locale
 * @property {(locale: string, loader: () => Promise<Record<string, string>>) => Promise<void>} loadLocale - Lazy-load translations for a locale
 * @property {(num: number, options?: Intl.NumberFormatOptions) => string} formatNumber - Locale-aware number formatting
 * @property {(date: Date, options?: Intl.DateTimeFormatOptions) => string} formatDate - Locale-aware date formatting
 * @property {(date: Date) => string} formatRelative - Relative time formatting ("2 hours ago", "in 3 days")
 */

/**
 * Resolve a nested key using dot notation from a messages object.
 * @param {Record<string, any>} obj
 * @param {string} key - Dot-separated key, e.g. "nav.home"
 * @returns {string | undefined}
 */
function resolveKey(obj, key) {
  if (!obj) return undefined;

  // Fast path: direct property
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    const val = obj[key];
    return typeof val === "string" ? val : undefined;
  }

  // Dot notation path
  const parts = key.split(".");
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[parts[i]];
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Interpolate `{param}` placeholders in a string.
 * @param {string} template
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    return params[name] !== undefined ? String(params[name]) : `{${name}}`;
  });
}

/**
 * Select the correct plural form from a pipe-separated template.
 *
 * Supports two formats:
 * - 2 forms: `"singular | plural"` — singular when count === 1, plural otherwise
 * - 3 forms: `"zero | one | other"` — zero when count === 0, one when count === 1, other otherwise
 *
 * @param {string} template
 * @param {number} count
 * @returns {string}
 */
function pluralize(template, count) {
  const forms = template.split("|").map((s) => s.trim());

  if (forms.length === 1) return forms[0];

  if (forms.length === 2) {
    // singular | plural
    return count === 1 ? forms[0] : forms[1];
  }

  // zero | one | other
  if (count === 0) return forms[0];
  if (count === 1) return forms[1];
  return forms[2];
}

/**
 * Create a reactive internationalization instance.
 *
 * @param {I18nConfig} config
 * @returns {I18nInstance}
 *
 * @example
 * const i18n = createI18n({
 *   defaultLocale: "en",
 *   fallbackLocale: "en",
 *   messages: {
 *     en: { greeting: "Hello, {name}!" },
 *     es: { greeting: "Hola, {name}!" }
 *   }
 * });
 *
 * i18n.t("greeting", { name: "Ada" }) // "Hello, Ada!"
 * i18n.setLocale("es");
 * i18n.t("greeting", { name: "Ada" }) // "Hola, Ada!"
 */
export function createI18n(config) {
  // Accept `locale` as a friendly alias for `defaultLocale` (common footgun).
  const defaultLocale = config.defaultLocale || config.locale;
  if (!defaultLocale || typeof defaultLocale !== "string") {
    throw new TypeError("createI18n requires config.defaultLocale (or config.locale) string.");
  }
  const fallbackLocale = config.fallbackLocale;
  const initialMessages = config.messages;

  /** @type {Record<string, Record<string, any>>} */
  const messages = { ...(initialMessages || {}) };

  const [locale, setLocaleSignal] = signal(defaultLocale);

  // A version counter that bumps when messages change, forcing re-evaluation
  const [version, setVersion] = signal(0);

  /**
   * Change the active locale.
   * @param {string} newLocale
   */
  function setLocale(newLocale) {
    setLocaleSignal(newLocale);
  }

  /**
   * Translate a key with optional interpolation and pluralization.
   *
   * Reads the current locale reactively so translations update
   * automatically when the locale changes.
   *
   * @param {string} key - Translation key (supports dot notation for nested keys)
   * @param {Record<string, string|number>} [params] - Interpolation parameters; use `count` for pluralization
   * @returns {string}
   */
  function t(key, params) {
    // Subscribe to reactive locale and version
    const currentLocale = locale();
    version(); // track message changes

    // Look up in current locale
    let template = resolveKey(messages[currentLocale], key);

    // Fallback locale
    if (template === undefined && fallbackLocale && currentLocale !== fallbackLocale) {
      template = resolveKey(messages[fallbackLocale], key);
    }

    // Fallback to key itself
    if (template === undefined) {
      return key;
    }

    // Pluralization
    if (params && params.count !== undefined && template.includes("|")) {
      template = pluralize(template, Number(params.count));
    }

    // Interpolation
    return interpolate(template, params);
  }

  /**
   * Lazy-load translations for a locale.
   *
   * @param {string} loc - Locale identifier
   * @param {() => Promise<Record<string, string>>} loader - Async function that returns the messages
   * @returns {Promise<void>}
   */
  async function loadLocale(loc, loader) {
    const loaded = await loader();
    messages[loc] = loaded;
    // Bump version to trigger reactive updates for any effect reading t()
    setVersion((v) => v + 1);
  }

  /**
   * Format a number using the current locale.
   *
   * @param {number} num
   * @param {Intl.NumberFormatOptions} [options]
   * @returns {string}
   */
  function formatNumber(num, options) {
    const currentLocale = locale();
    try {
      return new Intl.NumberFormat(currentLocale, options).format(num);
    } catch (_) {
      return String(num);
    }
  }

  /**
   * Format a date using the current locale.
   *
   * @param {Date} date
   * @param {Intl.DateTimeFormatOptions} [options]
   * @returns {string}
   */
  function formatDate(date, options) {
    const currentLocale = locale();
    try {
      return new Intl.DateTimeFormat(currentLocale, options).format(date);
    } catch (_) {
      return String(date);
    }
  }

  /**
   * Format a date as a relative time string (e.g. "2 hours ago", "in 3 days").
   *
   * Uses `Intl.RelativeTimeFormat` with the current locale.
   *
   * @param {Date} date
   * @returns {string}
   */
  function formatRelative(date) {
    const currentLocale = locale();
    const now = Date.now();
    const diffMs = date.getTime() - now;
    const absDiffMs = Math.abs(diffMs);

    /** @type {[Intl.RelativeTimeFormatUnit, number][]} */
    const units = [
      ["second", 1000],
      ["minute", 60 * 1000],
      ["hour", 60 * 60 * 1000],
      ["day", 24 * 60 * 60 * 1000],
      ["week", 7 * 24 * 60 * 60 * 1000],
      ["month", 30 * 24 * 60 * 60 * 1000],
      ["year", 365 * 24 * 60 * 60 * 1000],
    ];

    let unit = "second";
    let value = Math.round(diffMs / 1000);

    for (let i = units.length - 1; i >= 0; i--) {
      const [u, ms] = units[i];
      if (absDiffMs >= ms) {
        unit = u;
        value = Math.round(diffMs / ms);
        break;
      }
    }

    try {
      const rtf = new Intl.RelativeTimeFormat(currentLocale, { numeric: "auto" });
      return rtf.format(value, /** @type {Intl.RelativeTimeFormatUnit} */ (unit));
    } catch (_) {
      // Fallback for environments without Intl.RelativeTimeFormat
      if (value > 0) return `in ${Math.abs(value)} ${unit}(s)`;
      return `${Math.abs(value)} ${unit}(s) ago`;
    }
  }

  return {
    t,
    locale,
    setLocale,
    loadLocale,
    formatNumber,
    formatDate,
    formatRelative,
  };
}
