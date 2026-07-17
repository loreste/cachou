import { h, options, render } from "preact";
import { useState } from "preact/hooks";

options.debounceRendering = (callback) => callback();

export const preactAdapter = {
  name: "Preact",

  initialRows(target, rows) {
    render(h(Table, { rows }), target);
    return () => render(null, target);
  },

  textFanout(target, count, updates) {
    let setValue;
    function App() {
      const state = useState(0);
      setValue = state[1];
      return h("div", null, Array.from({ length: count }, (_, i) => h("span", { key: i }, state[0])));
    }
    render(h(App), target);
    for (let i = 1; i <= updates; i++) {
      setValue(i);
    }
    render(null, target);
  },

  attributeFanout(target, count, updates) {
    let setActive;
    function App() {
      const state = useState(false);
      setActive = state[1];
      return h("div", null, Array.from({ length: count }, (_, i) => h("button", { key: i, className: state[0] ? "active" : "" }, i)));
    }
    render(h(App), target);
    for (let i = 0; i < updates; i++) {
      setActive(i % 2 === 0);
    }
    render(null, target);
  },

  keyedReverse(target, rows) {
    let setRows;
    function App() {
      const state = useState(rows);
      setRows = state[1];
      return h(Table, { rows: state[0] });
    }
    render(h(App), target);
    setRows(rows.slice().reverse());
    render(null, target);
  },

  formInput(target, count) {
    let setValue;
    let currentValue = "";
    function App() {
      const state = useState("");
      currentValue = state[0];
      setValue = state[1];
      return h("input", { value: state[0], onInput: event => setValue(event.currentTarget.value) });
    }
    render(h(App), target);
    for (let i = 0; i < count; i++) {
      setValue(`value-${i}`);
    }
    render(h(App), target);
    if (currentValue !== `value-${count - 1}`) {
      throw new Error("Preact input state did not update");
    }
    render(null, target);
  },

  mountUnmount(target, loops) {
    for (let i = 0; i < loops; i++) {
      render(h(ManySpans, { iteration: i }), target);
      render(null, target);
    }
  },

  dashboardRefresh(target, cards, updates) {
    let setValue;
    function App() {
      const state = useState(0);
      setValue = state[1];
      return h(
        "section",
        { className: "dashboard-grid" },
        cards.map(card => h(
          "article",
          { className: "metric-card", key: card.id },
          h("h3", null, card.label),
          h("strong", null, state[0]),
          h("p", null, card.status)
        ))
      );
    }
    render(h(App), target);
    for (let i = 1; i <= updates; i++) setValue(i);
    if (target.querySelector("strong")?.textContent !== String(updates)) {
      throw new Error("Preact dashboard value did not commit");
    }
    render(null, target);
  }
};

function Table(props) {
  return h("table", null, h("tbody", null, props.rows.map(row => h("tr", { key: row.id }, h("td", null, row.id), h("td", null, row.label)))));
}

function ManySpans(props) {
  return h("div", null, Array.from({ length: 100 }, (_, j) => h("span", { key: j }, `${props.iteration}:${j}`)));
}
