import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

export const reactAdapter = {
  name: "React",

  initialRows(target, rows) {
    const root = createRoot(target);
    flushSync(() => {
      root.render(React.createElement(Table, { rows }));
    });
    return () => root.unmount();
  },

  textFanout(target, count, updates) {
    let setValue;
    const root = createRoot(target);
    function App() {
      const state = React.useState(0);
      setValue = state[1];
      return React.createElement(
        React.Fragment,
        null,
        Array.from({ length: count }, (_, i) => React.createElement("span", { key: i }, state[0]))
      );
    }
    flushSync(() => root.render(React.createElement(App)));
    for (let i = 1; i <= updates; i++) {
      flushSync(() => setValue(i));
    }
    root.unmount();
  },

  attributeFanout(target, count, updates) {
    let setActive;
    const root = createRoot(target);
    function App() {
      const state = React.useState(false);
      setActive = state[1];
      return React.createElement(
        React.Fragment,
        null,
        Array.from({ length: count }, (_, i) => React.createElement("button", { key: i, className: state[0] ? "active" : "" }, i))
      );
    }
    flushSync(() => root.render(React.createElement(App)));
    for (let i = 0; i < updates; i++) {
      flushSync(() => setActive(i % 2 === 0));
    }
    root.unmount();
  },

  keyedReverse(target, rows) {
    let setRows;
    const root = createRoot(target);
    function App() {
      const state = React.useState(rows);
      setRows = state[1];
      return React.createElement(Table, { rows: state[0] });
    }
    flushSync(() => root.render(React.createElement(App)));
    flushSync(() => setRows(rows.slice().reverse()));
    root.unmount();
  },

  formInput(target, count) {
    let setValue;
    let currentValue = "";
    const root = createRoot(target);
    function App() {
      const state = React.useState("");
      currentValue = state[0];
      setValue = state[1];
      return React.createElement("input", { value: state[0], onChange: event => setValue(event.target.value) });
    }
    flushSync(() => root.render(React.createElement(App)));
    for (let i = 0; i < count; i++) {
      flushSync(() => setValue(`value-${i}`));
    }
    if (currentValue !== `value-${count - 1}`) {
      throw new Error("React input state did not update");
    }
    root.unmount();
  },

  mountUnmount(target, loops) {
    for (let i = 0; i < loops; i++) {
      const root = createRoot(target);
      flushSync(() => root.render(React.createElement(ManySpans, { iteration: i })));
      root.unmount();
    }
  },

  dashboardRefresh(target, cards, updates) {
    let setValue;
    const root = createRoot(target);
    function App() {
      const state = React.useState(0);
      setValue = state[1];
      return React.createElement(
        "section",
        { className: "dashboard-grid" },
        cards.map(card => React.createElement(
          "article",
          { className: "metric-card", key: card.id },
          React.createElement("h3", null, card.label),
          React.createElement("strong", null, state[0]),
          React.createElement("p", null, card.status)
        ))
      );
    }
    flushSync(() => root.render(React.createElement(App)));
    for (let i = 1; i <= updates; i++) flushSync(() => setValue(i));
    if (target.querySelector("strong")?.textContent !== String(updates)) {
      throw new Error("React dashboard value did not commit");
    }
    root.unmount();
  }
};

function Table(props) {
  return React.createElement(
    "table",
    null,
    React.createElement(
      "tbody",
      null,
      props.rows.map(row => React.createElement(
        "tr",
        { key: row.id },
        React.createElement("td", null, row.id),
        React.createElement("td", null, row.label)
      ))
    )
  );
}

function ManySpans(props) {
  return React.createElement(
    "div",
    null,
    Array.from({ length: 100 }, (_, j) => React.createElement("span", { key: j }, `${props.iteration}:${j}`))
  );
}
