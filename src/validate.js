/**
 * Validation patterns for CachouJS form fields.
 *
 * Each validator is a pure function that accepts a value and returns
 * `{ valid: boolean, message?: string }`. Validators can be passed directly
 * to `createField({ validate: validators.email })`.
 *
 * @module cachoujs/validate
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the value passed validation.
 * @property {string} [message] - Human-readable error message when invalid.
 */

/**
 * @callback ValidatorFn
 * @param {*} value - The value to validate.
 * @returns {ValidationResult}
 */

/** @type {(valid: boolean, message?: string) => ValidationResult} */
const result = (valid, message) => valid ? { valid: true } : { valid: false, message };

/**
 * Create a custom validator from a test function and error message.
 *
 * @param {(value: *) => boolean} testFn - Returns `true` when the value is valid.
 * @param {string} message - Error message when validation fails.
 * @returns {ValidatorFn}
 *
 * @example
 * const isEven = createValidator(v => Number(v) % 2 === 0, "Must be even");
 * isEven(4);  // { valid: true }
 * isEven(3);  // { valid: false, message: "Must be even" }
 */
export function createValidator(testFn, message) {
  return (value) => {
    if (value == null || value === "") return result(true);
    return result(testFn(value), message);
  };
}

/**
 * Compose multiple validators. Runs in order and returns the first failure.
 *
 * @param {...ValidatorFn} fns - Validators to compose.
 * @returns {ValidatorFn}
 *
 * @example
 * const validate = compose(validators.required, validators.email);
 * validate("");       // { valid: false, message: "Required" }
 * validate("bad");   // { valid: false, message: "Invalid email address" }
 * validate("a@b.c"); // { valid: true }
 */
export function compose(...fns) {
  return (value) => {
    for (const fn of fns) {
      const res = fn(value);
      if (!res.valid) return res;
    }
    return result(true);
  };
}

// ---------------------------------------------------------------------------
// Email – RFC-ish check (covers the vast majority of real-world addresses)
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// URL – http or https only
// ---------------------------------------------------------------------------
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

// ---------------------------------------------------------------------------
// Phone – international style: digits, spaces, dashes, parens, optional +
// ---------------------------------------------------------------------------
const PHONE_RE = /^\+?[\d\s\-()]{7,}$/;

// ---------------------------------------------------------------------------
// Alphanumeric
// ---------------------------------------------------------------------------
const ALPHANUM_RE = /^[a-zA-Z0-9]+$/;

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------
const HEX_RE = /^(0x|0X)?[0-9a-fA-F]+$/;

// ---------------------------------------------------------------------------
// UUID v4
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Slug – lowercase letters, digits, dashes; no leading/trailing dash
// ---------------------------------------------------------------------------
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// IPv4
// ---------------------------------------------------------------------------
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

// ---------------------------------------------------------------------------
// ISO date YYYY-MM-DD
// ---------------------------------------------------------------------------
const DATE_ISO_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

// ---------------------------------------------------------------------------
// Strong password: 8+ chars, uppercase, lowercase, digit, special character
// ---------------------------------------------------------------------------
const STRONG_PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

/**
 * Luhn algorithm check for credit card numbers.
 * @param {string} value - Digits (spaces/dashes stripped).
 * @returns {boolean}
 */
function luhn(value) {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits) || digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Built-in validators.
 *
 * Direct validators accept a value and return `{ valid, message }`.
 * Factory validators (minLength, maxLength, min, max, pattern) return a
 * validator function when called with configuration.
 */
export const validators = {
  /**
   * Non-empty, non-null, non-undefined.
   * @param {*} value
   * @returns {ValidationResult}
   */
  required(value) {
    if (value == null) return result(false, "Required");
    if (typeof value === "string" && value.trim() === "") return result(false, "Required");
    return result(true);
  },

  /**
   * RFC-ish email address.
   * @param {*} value
   * @returns {ValidationResult}
   */
  email(value) {
    if (value == null || value === "") return result(true);
    return result(EMAIL_RE.test(String(value)), "Invalid email address");
  },

  /**
   * HTTP or HTTPS URL.
   * @param {*} value
   * @returns {ValidationResult}
   */
  url(value) {
    if (value == null || value === "") return result(true);
    return result(URL_RE.test(String(value)), "Invalid URL");
  },

  /**
   * International phone number (digits, spaces, dashes, parens, +).
   * @param {*} value
   * @returns {ValidationResult}
   */
  phone(value) {
    if (value == null || value === "") return result(true);
    return result(PHONE_RE.test(String(value)), "Invalid phone number");
  },

  /**
   * Credit card number validated with the Luhn algorithm.
   * @param {*} value
   * @returns {ValidationResult}
   */
  creditCard(value) {
    if (value == null || value === "") return result(true);
    return result(luhn(String(value)), "Invalid credit card number");
  },

  /**
   * Minimum string length.
   * @param {number} n - Minimum length.
   * @returns {ValidatorFn}
   */
  minLength(n) {
    return (value) => {
      if (value == null || value === "") return result(true);
      return result(String(value).length >= n, `Must be at least ${n} characters`);
    };
  },

  /**
   * Maximum string length.
   * @param {number} n - Maximum length.
   * @returns {ValidatorFn}
   */
  maxLength(n) {
    return (value) => {
      if (value == null || value === "") return result(true);
      return result(String(value).length <= n, `Must be at most ${n} characters`);
    };
  },

  /**
   * Numeric minimum (inclusive).
   * @param {number} n - Minimum value.
   * @returns {ValidatorFn}
   */
  min(n) {
    return (value) => {
      if (value == null || value === "") return result(true);
      return result(Number(value) >= n, `Must be at least ${n}`);
    };
  },

  /**
   * Numeric maximum (inclusive).
   * @param {number} n - Maximum value.
   * @returns {ValidatorFn}
   */
  max(n) {
    return (value) => {
      if (value == null || value === "") return result(true);
      return result(Number(value) <= n, `Must be at most ${n}`);
    };
  },

  /**
   * Custom regex pattern validator.
   * @param {RegExp} regex - Pattern to test against.
   * @param {string} [msg="Invalid format"] - Error message on failure.
   * @returns {ValidatorFn}
   */
  pattern(regex, msg = "Invalid format") {
    return (value) => {
      if (value == null || value === "") return result(true);
      return result(regex.test(String(value)), msg);
    };
  },

  /**
   * String that parses as a valid finite number.
   * @param {*} value
   * @returns {ValidationResult}
   */
  numeric(value) {
    if (value == null || value === "") return result(true);
    return result(!isNaN(Number(value)) && isFinite(Number(value)), "Must be a number");
  },

  /**
   * String that parses as a valid integer.
   * @param {*} value
   * @returns {ValidationResult}
   */
  integer(value) {
    if (value == null || value === "") return result(true);
    return result(Number.isInteger(Number(value)) && String(value).indexOf(".") === -1, "Must be an integer");
  },

  /**
   * Letters and numbers only.
   * @param {*} value
   * @returns {ValidationResult}
   */
  alphanumeric(value) {
    if (value == null || value === "") return result(true);
    return result(ALPHANUM_RE.test(String(value)), "Must contain only letters and numbers");
  },

  /**
   * Valid hexadecimal string.
   * @param {*} value
   * @returns {ValidationResult}
   */
  hex(value) {
    if (value == null || value === "") return result(true);
    return result(HEX_RE.test(String(value)), "Must be a valid hex value");
  },

  /**
   * UUID v4 format.
   * @param {*} value
   * @returns {ValidationResult}
   */
  uuid(value) {
    if (value == null || value === "") return result(true);
    return result(UUID_RE.test(String(value)), "Must be a valid UUID");
  },

  /**
   * URL slug (lowercase, digits, dashes, no spaces).
   * @param {*} value
   * @returns {ValidationResult}
   */
  slug(value) {
    if (value == null || value === "") return result(true);
    return result(SLUG_RE.test(String(value)), "Must be a valid URL slug");
  },

  /**
   * IPv4 address.
   * @param {*} value
   * @returns {ValidationResult}
   */
  ipv4(value) {
    if (value == null || value === "") return result(true);
    return result(IPV4_RE.test(String(value)), "Must be a valid IPv4 address");
  },

  /**
   * ISO date in YYYY-MM-DD format.
   * @param {*} value
   * @returns {ValidationResult}
   */
  dateISO(value) {
    if (value == null || value === "") return result(true);
    const str = String(value);
    if (!DATE_ISO_RE.test(str)) return result(false, "Must be a valid date (YYYY-MM-DD)");
    const d = new Date(str + "T00:00:00");
    const valid = !isNaN(d.getTime()) &&
      d.getUTCFullYear() === parseInt(str.slice(0, 4), 10) &&
      d.getUTCMonth() + 1 === parseInt(str.slice(5, 7), 10) &&
      d.getUTCDate() === parseInt(str.slice(8, 10), 10);
    return result(valid, "Must be a valid date (YYYY-MM-DD)");
  },

  /**
   * Strong password: 8+ characters with uppercase, lowercase, digit, and special character.
   * @param {*} value
   * @returns {ValidationResult}
   */
  strongPassword(value) {
    if (value == null || value === "") return result(true);
    return result(
      STRONG_PW_RE.test(String(value)),
      "Must be 8+ characters with uppercase, lowercase, number, and special character"
    );
  }
};
