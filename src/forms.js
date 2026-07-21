import { memo, signal } from "./reactivity.js";

function normalizeValidator(validator) {
  if (!validator) return null;
  if (typeof validator === "function") return validator;
  if (Array.isArray(validator)) {
    return async (value, values) => {
      for (const fn of validator) {
        const result = await fn(value, values);
        if (typeof result === "string" && result.length > 0) return result;
      }
      return null;
    };
  }
  return null;
}

export function createField(initialValue = "", options = {}) {
  const [value, setValueSignal] = signal(initialValue);
  const [error, setError] = signal(null);
  const [touched, setTouched] = signal(false);
  const [validating, setValidating] = signal(false);
  // Baseline for dirty tracking. reset(x) both writes x and becomes the new clean baseline.
  // Stored as a signal so dirty memo re-evaluates when baseline changes without a value change.
  const [baseline, setBaseline] = signal(initialValue);
  const validator = normalizeValidator(options.validate);
  let validationId = 0;

  const setValue = (next) => {
    setValueSignal(next);
    if (options.validateOnChange) {
      validate();
    }
  };

  const validate = async (values) => {
    if (!validator) {
      setError(null);
      return true;
    }
    const currentId = ++validationId;
    setValidating(true);
    try {
      const result = normalizeValidationResult(await validator(value(), values));
      if (currentId === validationId) {
        setError(result);
        return result == null;
      }
      // Stale run: do not clobber newer state; report current validity.
      return error() == null;
    } finally {
      if (currentId === validationId) {
        setValidating(false);
      }
    }
  };

  const reset = (nextValue = initialValue) => {
    validationId++;
    setBaseline(nextValue);
    setValueSignal(nextValue);
    setError(null);
    setTouched(false);
    setValidating(false);
  };

  return {
    value,
    setValue,
    error,
    setError,
    touched,
    setTouched,
    validating,
    dirty: memo(() => !Object.is(value(), baseline())),
    valid: memo(() => !error()),
    validate,
    reset
  };
}

function flattenFields(obj, prefix = "", out = {}) {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    out[prefix] = obj;
    return out;
  }
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      flattenFields(value, path, out);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const itemPath = `${path}.${index}`;
        if (item != null && typeof item === "object") flattenFields(item, itemPath, out);
        else out[itemPath] = item;
      });
      // also keep array root for whole-array updates
      out[path] = value;
    } else {
      out[path] = value;
    }
  }
  return out;
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    const asIndex = String(Number(next)) === next;
    if (cur[p] == null) cur[p] = asIndex ? [] : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/** Read a dotted path (`user.name`, `tags.0`) from a nested values object. */
function getPath(obj, path) {
  if (obj == null || path == null || path === "") return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
  const parts = String(path).split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Whether a dotted path is present (including a leaf explicitly set to undefined). */
function pathExists(obj, path) {
  if (obj == null || path == null || path === "") return false;
  if (Object.prototype.hasOwnProperty.call(obj, path)) return true;
  const parts = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, parts[i])) {
      return false;
    }
    cur = cur[parts[i]];
  }
  return true;
}

/** Only non-empty strings count as validation errors (matches FieldValidator types). */
function normalizeValidationResult(result) {
  if (typeof result === "string" && result.length > 0) return result;
  return null;
}

export function createForm(initialValues = {}, options = {}) {
  const fields = {};
  const validators = options.fields || {};
  const flat = options.nested ? flattenFields(initialValues) : null;
  const keys = flat ? Object.keys(flat).filter(k => !Array.isArray(flat[k]) || flat[k].some(x => typeof x !== "object")) : Object.keys(initialValues);

  if (options.nested) {
    // Prefer leaf scalar paths
    for (const [path, value] of Object.entries(flat)) {
      if (value != null && typeof value === "object") continue;
      fields[path] = createField(value, validators[path] || {});
    }
  } else {
    for (const key of Object.keys(initialValues)) {
      fields[key] = createField(initialValues[key], validators[key] || {});
    }
  }

  const [submitting, setSubmitting] = signal(false);
  const [submitError, setSubmitError] = signal(null);
  let submitId = 0;

  const values = memo(() => {
    if (!options.nested) {
      const result = {};
      for (const key of Object.keys(fields)) {
        result[key] = fields[key].value();
      }
      return result;
    }
    const result = {};
    for (const key of Object.keys(fields)) {
      setPath(result, key, fields[key].value());
    }
    return result;
  });

  /** Access nested field by path: form.field("address.city") */
  function field(path) {
    if (!fields[path]) {
      fields[path] = createField(
        options.nested ? flat?.[path] : undefined,
        validators[path] || {}
      );
    }
    return fields[path];
  }

  const validate = async () => {
    const currentValues = values();
    let ok = true;
    for (const key of Object.keys(fields)) {
      const fieldOk = await fields[key].validate(currentValues);
      ok = ok && fieldOk;
    }
    if (options.validate) {
      const formErrors = await options.validate(currentValues);
      // Success: null/undefined/false, or an empty object `{}`.
      // Only non-empty string field errors (and non-null values) fail validation.
      if (formErrors && typeof formErrors === "object" && !Array.isArray(formErrors)) {
        let hasFormError = false;
        for (const key of Object.keys(formErrors)) {
          const message = normalizeValidationResult(formErrors[key]);
          if (message == null) continue;
          hasFormError = true;
          if (fields[key]) {
            fields[key].setTouched(true);
            fields[key].setError(message);
          }
        }
        if (hasFormError) ok = false;
      }
    }
    return ok;
  };

  const reset = (nextValues = initialValues) => {
    const source = nextValues == null ? initialValues : nextValues;
    for (const key of Object.keys(fields)) {
      // Nested forms store fields as dotted paths (`user.name`). Walk the object tree
      // instead of `source[key]` (which only works for top-level keys).
      if (options.nested) {
        if (pathExists(source, key)) fields[key].reset(getPath(source, key));
        else fields[key].reset(); // missing path → field's own initial value
      } else if (Object.prototype.hasOwnProperty.call(source, key)) {
        fields[key].reset(source[key]);
      } else {
        fields[key].reset();
      }
    }
    setSubmitError(null);
    setSubmitting(false);
  };

  const handleSubmit = (handler = options.onSubmit) => async (event) => {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const currentSubmit = ++submitId;
    setSubmitError(null);
    for (const field of Object.values(fields)) {
      field.setTouched(true);
    }
    const ok = await validate();
    if (!ok || typeof handler !== "function") return false;
    setSubmitting(true);
    try {
      await handler(values(), { fields, reset });
      return true;
    } catch (err) {
      if (currentSubmit === submitId) {
        setSubmitError(err);
      }
      return false;
    } finally {
      if (currentSubmit === submitId) {
        setSubmitting(false);
      }
    }
  };

  return {
    fields,
    field,
    values,
    submitting,
    error: submitError,
    valid: memo(() => Object.values(fields).every(f => f.valid())),
    dirty: memo(() => Object.values(fields).some(f => f.dirty())),
    validate,
    reset,
    handleSubmit
  };
}
