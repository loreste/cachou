declare module "cachoujs/validate" {
  /** Result returned by a validator function. */
  export interface ValidationResult {
    valid: boolean;
    message?: string;
  }

  /** A validator function that checks a value and returns a result. */
  export type ValidatorFn = (value: any) => ValidationResult;

  /**
   * Create a custom validator from a test function and error message.
   * Empty/null values are treated as valid (use `validators.required` to reject them).
   */
  export function createValidator(
    testFn: (value: any) => boolean,
    message: string
  ): ValidatorFn;

  /**
   * Compose multiple validators. Runs in order and returns the first failure.
   */
  export function compose(...fns: ValidatorFn[]): ValidatorFn;

  /** Built-in validators. */
  export const validators: {
    /** Non-empty, non-null, non-undefined. */
    required: ValidatorFn;
    /** RFC-ish email address. */
    email: ValidatorFn;
    /** HTTP or HTTPS URL. */
    url: ValidatorFn;
    /** International phone number (digits, spaces, dashes, parens, +). */
    phone: ValidatorFn;
    /** Credit card number validated with the Luhn algorithm. */
    creditCard: ValidatorFn;
    /** String that parses as a valid finite number. */
    numeric: ValidatorFn;
    /** String that parses as a valid integer. */
    integer: ValidatorFn;
    /** Letters and numbers only. */
    alphanumeric: ValidatorFn;
    /** Valid hexadecimal string. */
    hex: ValidatorFn;
    /** UUID v4 format. */
    uuid: ValidatorFn;
    /** URL slug (lowercase, digits, dashes, no spaces). */
    slug: ValidatorFn;
    /** IPv4 address. */
    ipv4: ValidatorFn;
    /** ISO date in YYYY-MM-DD format. */
    dateISO: ValidatorFn;
    /** Strong password: 8+ characters with uppercase, lowercase, digit, and special character. */
    strongPassword: ValidatorFn;

    /** Minimum string length. */
    minLength(n: number): ValidatorFn;
    /** Maximum string length. */
    maxLength(n: number): ValidatorFn;
    /** Numeric minimum (inclusive). */
    min(n: number): ValidatorFn;
    /** Numeric maximum (inclusive). */
    max(n: number): ValidatorFn;
    /** Custom regex pattern validator. */
    pattern(regex: RegExp, msg?: string): ValidatorFn;
  };
}
