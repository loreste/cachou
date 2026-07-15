import { createSignal } from "solid-js";
import html from "solid-js/html";
import { render } from "solid-js/web";

export const solidAdapter = {
  name: "Solid",

  initialRows(target, rows) {
    const dispose = render(() => html`
      <table>
        <tbody>
          ${rows.map(row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`)}
        </tbody>
      </table>
    `, target);
    dispose();
  },

  textFanout(target, count, updates) {
    const [value, setValue] = createSignal(0);
    const dispose = render(() => html`<div>${Array.from({ length: count }, (_, i) => html`<span>${value}</span>`)}</div>`, target);
    for (let i = 1; i <= updates; i++) {
      setValue(i);
    }
    dispose();
  },

  attributeFanout(target, count, updates) {
    const [active, setActive] = createSignal(false);
    const dispose = render(() => html`<div>${Array.from({ length: count }, (_, i) => html`<button class=${() => active() ? "active" : ""}>${i}</button>`)}</div>`, target);
    for (let i = 0; i < updates; i++) {
      setActive(i % 2 === 0);
    }
    dispose();
  },

  keyedReverse(target, rows) {
    const [items, setItems] = createSignal(rows);
    const dispose = render(() => html`
      <table>
        <tbody>
          ${() => items().map(row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`)}
        </tbody>
      </table>
    `, target);
    setItems(rows.slice().reverse());
    dispose();
  },

  formInput(target, count) {
    const [value, setValue] = createSignal("");
    const dispose = render(() => html`<input value=${value}>`, target);
    for (let i = 0; i < count; i++) {
      setValue(`value-${i}`);
    }
    if (value() !== `value-${count - 1}`) {
      throw new Error("Solid input state did not update");
    }
    dispose();
  },

  mountUnmount(target, loops) {
    for (let i = 0; i < loops; i++) {
      const dispose = render(() => html`<div>${Array.from({ length: 100 }, (_, j) => html`<span>${i}:${j}</span>`)}</div>`, target);
      dispose();
    }
  }
};
