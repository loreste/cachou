import { createApp, h, nextTick, ref } from "vue";

export const vueAdapter = {
  name: "Vue",

  async initialRows(target, rows) {
    const app = createApp({ render: () => h(Table, { rows }) });
    app.mount(target);
    await nextTick();
    return () => app.unmount();
  },

  async textFanout(target, count, updates) {
    const value = ref(0);
    const app = createApp({
      render: () => h("div", null, Array.from({ length: count }, (_, i) => h("span", { key: i }, value.value)))
    });
    app.mount(target);
    for (let i = 1; i <= updates; i++) {
      value.value = i;
      await nextTick();
    }
    app.unmount();
  },

  async attributeFanout(target, count, updates) {
    const active = ref(false);
    const app = createApp({
      render: () => h("div", null, Array.from({ length: count }, (_, i) => h("button", { key: i, class: active.value ? "active" : "" }, i)))
    });
    app.mount(target);
    for (let i = 0; i < updates; i++) {
      active.value = i % 2 === 0;
      await nextTick();
    }
    app.unmount();
  },

  async keyedReverse(target, rows) {
    const currentRows = ref(rows);
    const app = createApp({ render: () => h(Table, { rows: currentRows.value }) });
    app.mount(target);
    currentRows.value = rows.slice().reverse();
    await nextTick();
    app.unmount();
  },

  async formInput(target, count) {
    const value = ref("");
    const app = createApp({
      render: () => h("input", { value: value.value, onInput: event => value.value = event.target.value })
    });
    app.mount(target);
    for (let i = 0; i < count; i++) {
      value.value = `value-${i}`;
      await nextTick();
    }
    if (value.value !== `value-${count - 1}`) {
      throw new Error("Vue input state did not update");
    }
    app.unmount();
  },

  async mountUnmount(target, loops) {
    for (let i = 0; i < loops; i++) {
      const app = createApp({ render: () => h(ManySpans, { iteration: i }) });
      app.mount(target);
      await nextTick();
      app.unmount();
    }
  },

  async dashboardRefresh(target, cards, updates) {
    const value = ref(0);
    const app = createApp({
      render: () => h(
        "section",
        { class: "dashboard-grid" },
        cards.map(card => h(
          "article",
          { class: "metric-card", key: card.id },
          [h("h3", null, card.label), h("strong", null, value.value), h("p", null, card.status)]
        ))
      )
    });
    app.mount(target);
    for (let i = 1; i <= updates; i++) {
      value.value = i;
      await nextTick();
    }
    if (target.querySelector("strong")?.textContent !== String(updates)) {
      throw new Error("Vue dashboard value did not commit");
    }
    app.unmount();
  }
};

function Table(props) {
  return h("table", null, h("tbody", null, props.rows.map(row => h("tr", { key: row.id }, [h("td", null, row.id), h("td", null, row.label)]))));
}

function ManySpans(props) {
  return h("div", null, Array.from({ length: 100 }, (_, j) => h("span", { key: j }, `${props.iteration}:${j}`)));
}
