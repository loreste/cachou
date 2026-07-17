import { html, mapArray, mount, signal } from "../../../src/index.js";

export const cachouAdapter = {
  name: "CachouJS",

  initialRows(target, rows) {
    return mount(() => html`
      <table>
        <tbody>
          ${rows.map(row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`)}
        </tbody>
      </table>
    `, target);
  },

  textFanout(target, count, updates) {
    const [value, setValue] = signal(0);
    const dispose = mount(() => html`<div>${Array.from({ length: count }, () => html`<span>${value}</span>`)}</div>`, target);
    for (let value = 1; value <= updates; value++) {
      setValue(value);
    }
    dispose();
  },

  attributeFanout(target, count, updates) {
    const [active, setActive] = signal(false);
    const dispose = mount(() => html`<div>${Array.from({ length: count }, (_, i) => html`<button class:active=${active}>${i}</button>`)}</div>`, target);
    for (let i = 0; i < updates; i++) {
      setActive(i % 2 === 0);
    }
    dispose();
  },

  keyedReverse(target, rows) {
    const [items, setItems] = signal(rows);
    const dispose = mount(() => html`
        <table>
          <tbody>
            ${mapArray(items, row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`, row => row.id, { reactiveItems: false, uniqueKeys: true })}
          </tbody>
        </table>
      `, target);
    setItems(rows.slice().reverse());
    dispose();
  },

  formInput(target, count) {
    const [value, setValue] = signal("");
    let input;
    const dispose = mount(() => {
      input = html`<input bind:value=${[value, setValue]}>`;
      return input;
    }, target);
    for (let i = 0; i < count; i++) {
      setValue(`value-${i}`);
    }
    if (value() !== `value-${count - 1}` || input.value !== `value-${count - 1}`) {
      throw new Error("CachouJS input signal did not update");
    }
    dispose();
  },

  mountUnmount(target, loops) {
    const App = (i) => html`<div>${Array.from({ length: 100 }, (_, j) => html`<span>${i}:${j}</span>`)}</div>`;
    for (let i = 0; i < loops; i++) {
      const dispose = mount(() => App(i), target);
      dispose();
    }
  },

  dashboardRefresh(target, cards, updates) {
    const [value, setValue] = signal(0);
    const dispose = mount(() => html`
      <section class="dashboard-grid">
        ${cards.map(card => html`
          <article class="metric-card">
            <h3>${card.label}</h3>
            <strong>${value}</strong>
            <p>${card.status}</p>
          </article>
        `)}
      </section>
    `, target);
    for (let i = 1; i <= updates; i++) setValue(i);
    if (target.querySelector("strong")?.textContent !== String(updates)) {
      throw new Error("CachouJS dashboard value did not commit");
    }
    dispose();
  }
};
