# Use Accessibility Helpers

CachouJS ships small **primitives**. You still own semantic HTML, labels, contrast, and keyboard flows.

Related: [Forms](./use-forms.md), [API: Accessibility](../API.md#accessibility).

---

## Live regions (announcements)

```javascript
import { createLiveRegion, html, onMount, onCleanup } from "cachoujs";

function ToastHost() {
  const [announce, regionEl] = createLiveRegion({ assertive: false });

  // regionEl may be an element to place in the tree depending on implementation;
  // announce(message) updates the live region text for screen readers.
  onMount(() => {
    // example: expose announce to the app
    window.__announce = announce;
    onCleanup(() => {
      delete window.__announce;
    });
  });

  return html`
    <div class="sr-host">
      <!-- keep a polite status area in the document -->
      <button type="button" onclick=${() => announce("Item saved")}>
        Save
      </button>
    </div>
  `;
}
```

Use `assertive: true` sparingly (urgent errors). Prefer polite updates for routine status.

---

## Focus first control

```javascript
import { focusFirst } from "cachoujs";

function openDialog(dialogRoot) {
  dialogRoot.hidden = false;
  focusFirst(dialogRoot); // focuses first tabbable element
}
```

---

## Restore focus after a flow

```javascript
import { restoreFocusAfter } from "cachoujs";

button.onclick = () => {
  restoreFocusAfter(() => {
    openModal();
    // when the modal closes and this stack returns, focus restores
  });
};
```

Useful when opening temporary UI that steals focus.

---

## Focus trap (modals)

```javascript
import { trapFocus, onCleanup } from "cachoujs";

function Modal(props) {
  let panel;

  // after mount
  queueMicrotask(() => {
    const stop = trapFocus(panel);
    onCleanup(stop);
  });

  return html`
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      ref=${el => {
        panel = el;
      }}
    >
      ${props.children}
      <button type="button" onclick=${props.onClose}>Close</button>
    </div>
  `;
}
```

Always provide an obvious close action and `Escape` handling in the product UI.

---

## Semantic checklist (your responsibility)

- [ ] One `h1` per view; heading order makes sense  
- [ ] Buttons are `<button>`, links are `<a href>`  
- [ ] Form fields have labels  
- [ ] Errors linked via `aria-describedby` / `role="alert"`  
- [ ] Color is not the only status signal  
- [ ] Keyboard can reach all actions  

## Route focus

After `navigate`, Cachou focuses `[data-cachou-route-focus], main, h1` when focus restoration is enabled (default). Mark your main landmark:

```html
<main data-cachou-route-focus tabindex="-1">…</main>
```

## Next

- [Use forms](./use-forms.md)
- [Routing](./routing-and-lazy-pages.md)
