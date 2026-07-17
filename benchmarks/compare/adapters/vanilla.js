export const vanillaAdapter = {
  name: "DOM floor",

  initialRows(target, rows) {
    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    for (const row of rows) {
      tbody.appendChild(rowNode(row));
    }
    table.appendChild(tbody);
    target.appendChild(table);
    return () => clearTarget(target);
  },

  textFanout(target, count, updates) {
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const span = document.createElement("span");
      span.textContent = "0";
      nodes.push(span);
      target.appendChild(span);
    }
    for (let value = 1; value <= updates; value++) {
      for (const node of nodes) {
        node.textContent = String(value);
      }
    }
    clearTarget(target);
  },

  attributeFanout(target, count, updates) {
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const button = document.createElement("button");
      button.textContent = String(i);
      nodes.push(button);
      target.appendChild(button);
    }
    for (let i = 0; i < updates; i++) {
      const active = i % 2 === 0;
      for (const node of nodes) {
        node.className = active ? "active" : "";
      }
    }
    clearTarget(target);
  },

  keyedReverse(target, rows) {
    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    const nodeById = new Map();
    for (const row of rows) {
      const node = rowNode(row);
      nodeById.set(row.id, node);
      tbody.appendChild(node);
    }
    table.appendChild(tbody);
    target.appendChild(table);
    const reversed = rows.slice().reverse();
    for (const row of reversed) {
      tbody.appendChild(nodeById.get(row.id));
    }
    clearTarget(target);
  },

  formInput(target, count) {
    let value = "";
    const input = document.createElement("input");
    target.appendChild(input);
    for (let i = 0; i < count; i++) {
      value = `value-${i}`;
      input.value = value;
    }
    if (value !== `value-${count - 1}`) {
      throw new Error("DOM floor input state did not update");
    }
    clearTarget(target);
  },

  mountUnmount(target, loops) {
    for (let i = 0; i < loops; i++) {
      const frag = document.createDocumentFragment();
      for (let j = 0; j < 100; j++) {
        const span = document.createElement("span");
        span.textContent = `${i}:${j}`;
        frag.appendChild(span);
      }
      target.appendChild(frag);
      target.replaceChildren();
    }
  },

  dashboardRefresh(target, cards, updates) {
    const section = document.createElement("section");
    section.className = "dashboard-grid";
    const values = [];
    for (const card of cards) {
      const article = document.createElement("article");
      article.className = "metric-card";
      const heading = document.createElement("h3");
      heading.textContent = card.label;
      const value = document.createElement("strong");
      value.textContent = "0";
      values.push(value);
      const status = document.createElement("p");
      status.textContent = card.status;
      article.append(heading, value, status);
      section.appendChild(article);
    }
    target.appendChild(section);
    for (let i = 1; i <= updates; i++) {
      const text = String(i);
      for (const value of values) value.textContent = text;
    }
    if (values[0]?.textContent !== String(updates)) {
      throw new Error("DOM dashboard value did not commit");
    }
    clearTarget(target);
  }
};

function clearTarget(target) {
  target.replaceChildren();
}

function rowNode(row) {
  const tr = document.createElement("tr");
  const id = document.createElement("td");
  const label = document.createElement("td");
  id.textContent = String(row.id);
  label.textContent = row.label;
  tr.append(id, label);
  return tr;
}
