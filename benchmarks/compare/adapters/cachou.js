import { html, mapArray, mount, signal } from "../../../src/index.js";

export const cachouAdapter = {
  name: "CachouJS",

  initialRows(target, rows) {
    target.appendChild(html`
      <table>
        <tbody>
          ${rows.map(row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`)}
        </tbody>
      </table>
    `);
  },

  textFanout(target, count, updates) {
    const [value, setValue] = signal(0);
    const nodes = [];
    for (let i = 0; i < count; i++) {
      nodes.push(html`<span>${value}</span>`);
    }
    target.append(...nodes);
    for (let value = 1; value <= updates; value++) {
      setValue(value);
    }
  },

  attributeFanout(target, count, updates) {
    const [active, setActive] = signal(false);
    const nodes = [];
    for (let i = 0; i < count; i++) {
      nodes.push(html`<button class:active=${active}>${i}</button>`);
    }
    target.append(...nodes);
    for (let i = 0; i < updates; i++) {
      setActive(i % 2 === 0);
    }
  },

  keyedReverse(target, rows) {
    const [items, setItems] = signal(rows);
    const table = html`
      <table>
        <tbody>
          ${mapArray(items, row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`, row => row.id, { reactiveItems: false, uniqueKeys: true })}
        </tbody>
      </table>
    `;
    target.appendChild(table);
    setItems(rows.slice().reverse());
  },

  formInput(target, count) {
    const [value, setValue] = signal("");
    const input = html`<input bind:value=${[value, setValue]}>`;
    target.appendChild(input);
    for (let i = 0; i < count; i++) {
      setValue(`value-${i}`);
    }
    if (value() !== `value-${count - 1}` || input.value !== `value-${count - 1}`) {
      throw new Error("CachouJS input signal did not update");
    }
  },

  mountUnmount(target, loops) {
    const App = (i) => html`<div>${Array.from({ length: 100 }, (_, j) => html`<span>${i}:${j}</span>`)}</div>`;
    for (let i = 0; i < loops; i++) {
      const dispose = mount(() => App(i), target);
      dispose();
    }
  }
};
