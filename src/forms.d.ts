/**
 * Form field helpers.
 * @module cachoujs/forms
 */
declare module "cachoujs/forms" {
  import type { SignalGetter, SignalSetter } from "cachoujs";

  export type FieldValidator<T = unknown> =
    | ((value: T, values?: any) => string | null | undefined | Promise<string | null | undefined>)
    | Array<(value: T, values?: any) => string | null | undefined | Promise<string | null | undefined>>;

  export interface FieldOptions<T = string> {
    validate?: FieldValidator<T>;
    validateOnChange?: boolean;
  }

  export interface FieldApi<T = string> {
    value: SignalGetter<T>;
    setValue: SignalSetter<T>;
    error: SignalGetter<any>;
    setError: SignalSetter<any>;
    touched: SignalGetter<boolean>;
    setTouched: SignalSetter<boolean>;
    validating: SignalGetter<boolean>;
    dirty: SignalGetter<boolean>;
    valid: SignalGetter<boolean>;
    validate: (values?: any) => Promise<boolean>;
    reset: (nextValue?: T) => void;
  }

  export function createField<T = string>(
    initialValue?: T,
    options?: FieldOptions<T>
  ): FieldApi<T>;

  export interface FormOptions<T extends Record<string, any>> {
    nested?: boolean;
    fields?: Partial<Record<string, FieldOptions<any>>> &
      Partial<Record<keyof T, FieldOptions<any>>>;
    validate?: (values: T) => any | Promise<any>;
    onSubmit?: (values: T, context: any) => any | Promise<any>;
  }

  export interface FormApi<T extends Record<string, any>> {
    fields: Record<string, FieldApi<any>>;
    field: (path: string) => FieldApi<any>;
    values: SignalGetter<T>;
    submitting: SignalGetter<boolean>;
    error: SignalGetter<any>;
    valid: SignalGetter<boolean>;
    dirty: SignalGetter<boolean>;
    validate: () => Promise<boolean>;
    reset: (nextValues?: T) => void;
    handleSubmit: (
      handler?: (values: T, context: any) => any | Promise<any>
    ) => (event?: Event) => Promise<boolean>;
  }

  export function createForm<T extends Record<string, any>>(
    initialValues: T,
    options?: FormOptions<T>
  ): FormApi<T>;
}
