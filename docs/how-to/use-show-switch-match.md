# Use Show / Switch / Match

Lightweight control-flow helpers. They return reactive functions suitable for `${...}` slots in `html`.

## Show

```javascript
import { Show, signal, html } from "cachoujs";

const [open, setOpen] = signal(true);

html`
  <div>
    ${Show({
      when: open,
      fallback: () => html`<p>Closed</p>`,
      children: () => html`<p>Open</p>`
    })}
  </div>
`;
```

If `when` is an object, it is passed to `children`:

```javascript
Show({
  when: () => user(),
  children: u => html`<span>${u.name}</span>`
});
```

## Switch + Match

```javascript
import { Switch, Match, signal, html } from "cachoujs";

const [tab, setTab] = signal("home");

html`
  ${Switch({
    fallback: () => html`<p>Unknown</p>`,
    children: [
      Match({ when: () => tab() === "home", children: () => html`<Home/>` }),
      Match({ when: () => tab() === "settings", children: () => html`<Settings/>` })
    ]
  })}
`;
```

First truthy `Match` wins.

## Import

```javascript
import { Show, Switch, Match } from "cachoujs";
// or
import { Show, Switch, Match } from "cachoujs/flow";
```
