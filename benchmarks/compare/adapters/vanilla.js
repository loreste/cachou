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
  }
};

function rowNode(row) {
  const tr = document.createElement("tr");
  const id = document.createElement("td");
  const label = document.createElement("td");
  id.textContent = String(row.id);
  label.textContent = row.label;
  tr.append(id, label);
  return tr;
}
