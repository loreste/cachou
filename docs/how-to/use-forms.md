# Use Form Helpers

Use `createField` for a single control or `createForm` for multi-field validation and submit.

Related: [Templates](./use-templates-and-directives.md) (`bind:`), [API: Forms](../API.md#forms).

---

## `<select>` value binding

Cachou templates often bind `value=` on `<select>` **before** dynamic `<option>` children are inserted. Browsers ignore `select.value` when no matching option exists yet, which used to leave a placeholder selected.

From **1.0.8**, Cachou remembers the desired value and **re-applies** it after options mount or change. These all work:

```javascript
// Preferred: value on the select + dynamic options
const [serverId, setServerId] = signal("prod");
const servers = () => [{ id: "prod", name: "Production" }, { id: "staging", name: "Staging" }];

html`
  <select value=${serverId} onchange=${e => setServerId(e.target.value)}>
    ${() => servers().map(s => html`<option value=${s.id}>${s.name}</option>`)}
  </select>
`;

// Or bind:value / model
html`<select bind:value=${[serverId, setServerId]}>...</select>`;

// Or per-option selected (also supported)
html`
  <select>
    <option value="user" selected=${() => role() === "user"}>User</option>
    <option value="admin" selected=${() => role() === "admin"}>Admin</option>
  </select>
`;
```

**App state tip:** keep selection signals at the app (or panel owner) level, not inside a view function that re-runs and recreates signals on every parent update — otherwise the control appears to “reset” even when the DOM binding is correct.

**Reactive value tip:** bind with an accessor, not a one-shot read:

```javascript
// Wrong — evaluates once; parent remounts or select stays stale
value=${userDraft().role}

// Right — Cachou subscribes and updates the control
value=${() => userDraft().role}
// or pass the signal getter when it is the whole value
value=${serverId}
```

Reading `userDraft().role` *while building* a parent view also tracks that signal and **remounts the whole panel on every keystroke**. Prefer accessors so only the control updates.

**Optimistic UI tip:** when a role/permission PATCH is in flight, either keep showing the optimistic value or disable the control until the request settles so a re-render with stale props does not look like a revert.

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

## Nested paths (0.4)

```javascript
import { createForm, html } from "cachoujs";

const form = createForm(
  { address: { city: "", zip: "" }, tags: [""] },
  {
    nested: true,
    fields: {
      "address.city": {
        validate: v => (String(v).trim() ? null : "City required")
      }
    },
    onSubmit: async values => {
      await save(values);
    }
  }
);

const city = form.fields["address.city"];

html`
  <input
    value=${() => city.value()}
    oninput=${e => city.setValue(e.target.value)}
  />
`;
```

Use dotted paths for nested objects/arrays when `nested: true`.

## Accessibility tips

- Associate `<label>` with inputs (`for` / wrapping).  
- Surface errors with `role="alert"`.  
- Disable submit while `submitting()`.  
- See [Use accessibility helpers](./use-accessibility.md).

## Next

- [Use resources](./use-resources.md) after submit  
- [Use framework APIs](./use-framework-apis.md) for `createMutation`  
- [Configure security policy](./configure-security-policy.md)  
