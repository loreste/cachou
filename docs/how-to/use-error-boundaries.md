# Use Error Boundaries

Wrap UI that may throw during setup, reactive evaluation, or child rendering so the rest of the app keeps working.

Related: [Prevent leaks](./prevent-leaks-and-races.md), [API](../API.md#components--composition).

---

## Basic usage

```javascript
import { ErrorBoundary, html, signal } from "cachoujs";

function RiskyPanel() {
  const [n] = signal(0);
  // imagine a throw if data is corrupt
  if (n() < 0) throw new Error("Invalid counter");
  return html`<p>OK</p>`;
}

export function SafePanel() {
  return ErrorBoundary({
    children: () => RiskyPanel(),
    fallback: (error, reset) => html`
      <section role="alert">
        <h2>Something went wrong</h2>
        <p>${error.message}</p>
        <button type="button" onclick=${reset}>Retry</button>
      </section>
    `
  });
}
```

`fallback` may be a node or `(error, reset) => node`. Calling **`reset`** re-attempts the children.

---

## Scoped recovery

Place boundaries around independent panels (dashboard widgets, route sections) so one failure does not blank the shell:

```javascript
html`
  <div class="layout">
    ${Shell()}
    ${ErrorBoundary({
      children: () => RouteView(),
      fallback: (err, reset) => html`
        <div role="alert">
          <p>${err.message}</p>
          <button type="button" onclick=${reset}>Reload section</button>
        </div>
      `
    })}
  </div>
`;
```

---

## `onError`

Register a handler on the current owner to log or report without necessarily rendering UI:

```javascript
import { onError, createRoot } from "cachoujs";

createRoot(() => {
  onError(err => {
    console.error(err);
    // reportError(err)
  });
  // …
});
```

---

## What boundaries are not

- Not a substitute for validating API data before use  
- Not global `window.onerror` (wire that separately if needed)  
- Not automatic network-error UI — handle `createResource` `error()` yourself  

## Next

- [Use resources](./use-resources.md) for expected async failures  
- [Enable debug diagnostics](./enable-debug-diagnostics.md)  
