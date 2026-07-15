import { memo, signal } from "./reactivity.js";

function normalizeValidator(validator) {
  if (!validator) return null;
  if (typeof validator === "function") return validator;
  if (Array.isArray(validator)) {
    return async (value, values) => {
      for (const fn of validator) {
        const result = await fn(value, values);
        if (result) return result;
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
      const result = await validator(value(), values);
      if (currentId === validationId) {
        setError(result || null);
      }
      return !result;
    } finally {
      if (currentId === validationId) {
        setValidating(false);
      }
    }
  };

  const reset = (nextValue = initialValue) => {
    validationId++;
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
    dirty: memo(() => value() !== initialValue),
    valid: memo(() => !error()),
    validate,
    reset
  };
}

export function createForm(initialValues = {}, options = {}) {
  const fields = {};
  const validators = options.fields || {};
  for (const key of Object.keys(initialValues)) {
    fields[key] = createField(initialValues[key], validators[key] || {});
  }

  const [submitting, setSubmitting] = signal(false);
  const [submitError, setSubmitError] = signal(null);
  let submitId = 0;

  const values = memo(() => {
    const result = {};
    for (const key of Object.keys(fields)) {
      result[key] = fields[key].value();
    }
    return result;
  });

  const validate = async () => {
    const currentValues = values();
    let ok = true;
    for (const key of Object.keys(fields)) {
      const fieldOk = await fields[key].validate(currentValues);
      ok = ok && fieldOk;
    }
    if (options.validate) {
      const formErrors = await options.validate(currentValues);
      if (formErrors && typeof formErrors === "object") {
        for (const key of Object.keys(formErrors)) {
          if (fields[key]) {
            fields[key].setTouched(true);
            fields[key].setError(formErrors[key]);
          }
        }
        ok = false;
      }
    }
    return ok;
  };

  const reset = (nextValues = initialValues) => {
    for (const key of Object.keys(fields)) {
      fields[key].reset(nextValues[key]);
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
    values,
    submitting,
    error: submitError,
    valid: memo(() => Object.values(fields).every(field => field.valid())),
    dirty: memo(() => Object.values(fields).some(field => field.dirty())),
    validate,
    reset,
    handleSubmit
  };
}
