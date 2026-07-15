# Use Form Helpers

Use `createField` for a single control or `createForm` for multi-field validation and submit.

Related: [Templates](./use-templates-and-directives.md) (`bind:`), [API: Forms](../API.md#forms).

---

## Full form example

```javascript
import { createForm, html } from "cachoujs";

const form = createForm(
  { name: "", email: "" },
  {
    fields: {
      name: {
        validate: value => (!String(value).trim() ? "Name is required." : null),
        validateOnChange: true
      },
      email: {
        validate: value => (value.includes("@") ? null : "Enter a valid email."),
        validateOnChange: true
      }
    },
    validate: values => {
      // optional cross-field checks; return map of errors or throw/return message per your version
    },
    onSubmit: async (values, ctx) => {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (!res.ok) throw new Error(await res.text());
    }
  }
);

export function Signup() {
  const email = form.fields.email;
  const name = form.fields.name;

  return html`
    <form onsubmit=${form.handleSubmit()}>
      <label>
        Name
        <input
          name="name"
          value=${() => name.value()}
          oninput=${e => name.setValue(e.target.value)}
          onblur=${() => name.setTouched(true)}
        />
      </label>
      ${() =>
        name.touched() && name.error()
          ? html`<p class="error" role="alert">${name.error()}</p>`
          : ""}

      <label>
        Email
        <input
          name="email"
          type="email"
          bind:value=${[email.value, email.setValue]}
          onblur=${() => email.setTouched(true)}
        />
      </label>
      ${() =>
        email.touched() && email.error()
          ? html`<p class="error" role="alert">${email.error()}</p>`
          : ""}

      <button type="submit" disabled=${() => form.submitting() || !form.valid()}>
        ${() => (form.submitting() ? "Saving…" : "Save")}
      </button>

      ${() =>
        form.error()
          ? html`<p class="error" role="alert">${String(form.error())}</p>`
          : ""}
    </form>
  `;
}
```

---

## Single field

```javascript
import { createField } from "cachoujs";

const password = createField("", {
  validate: [
    v => (v.length < 8 ? "Min 8 characters" : null),
    v => (!/[0-9]/.test(v) ? "Include a number" : null)
  ],
  validateOnChange: true
});

await password.validate();
password.reset();
```

Field API: `value`, `setValue`, `error`, `setError`, `touched`, `setTouched`, `validating`, `dirty`, `valid`, `validate`, `reset`.

---

## Form API

| Member | Role |
|--------|------|
| `fields` | Per-key field objects |
| `values()` | Snapshot of all values |
| `submitting()` | Submit in flight |
| `error()` | Form-level error |
| `valid()` / `dirty()` | Aggregates |
| `validate()` | Run all validators |
| `reset(next?)` | Restore initial or provided values |
| `handleSubmit(fn?)` | Returns `onsubmit` handler; prevents default |

---

## Race safety

Async validation and submit **ignore stale completions**. If the user edits while a slow validator runs, an older result cannot overwrite the newer field error state.

Still pass `AbortSignal` to your `fetch` when possible:

```javascript
onSubmit: async (values) => {
  const controller = new AbortController();
  // wire controller to UI cancel if you add one
  await fetch("/api/save", {
    method: "POST",
    body: JSON.stringify(values),
    signal: controller.signal
  });
}
```

---

## Accessibility tips

- Associate `<label>` with inputs (`for` / wrapping).  
- Surface errors with `role="alert"`.  
- Disable submit while `submitting()`.  
- See [Use accessibility helpers](./use-accessibility.md).

## Next

- [Use resources](./use-resources.md) after submit  
- [Configure security policy](./configure-security-policy.md)  
