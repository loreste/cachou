declare module "cachoujs/mask" {
  /**
   * A mask directive function: given an input element, attaches mask behavior
   * and returns a cleanup function.
   */
  export type MaskDirective = (el: HTMLInputElement) => () => void;

  /**
   * Create a mask directive from a pattern string.
   *
   * Pattern characters:
   * - `9` -- digit (0-9)
   * - `A` -- letter (a-z, A-Z)
   * - `*` -- any character
   * - Everything else is a literal inserted automatically.
   *
   * @param pattern Mask pattern string.
   * @returns A directive value for use with `use:mask`.
   */
  export function mask(pattern: string): MaskDirective;

  /** Pre-built masks for common formats. */
  export const masks: {
    /** US phone: (555) 555-5555 */
    phone: MaskDirective;
    /** Credit card: 4242 4242 4242 4242 */
    creditCard: MaskDirective;
    /** Date: MM/DD/YYYY */
    date: MaskDirective;
    /** Time: HH:MM */
    time: MaskDirective;
    /** SSN: 555-55-5555 */
    ssn: MaskDirective;
    /** US zip code: 12345-6789 */
    zip: MaskDirective;
    /** Currency: $1,234.56 */
    currency: MaskDirective;
  };
}
