import {
  assertNoReactiveLeaks,
  createResource,
  configureResourceCache,
  enableDebug,
  html,
  Island,
  mapArray,
  mount,
  prefetchResource,
  resetDebugState,
  signal
} from "../../src/index.js";

const target = document.getElementById("target");
const results = document.getElementById("results");
const runButton = document.getElementById("run");

function countNodes(root) {
  return root.querySelectorAll("*").length;
}

function makeRows(count, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1 + offset, label: `Row ${i + 1 + offset}` }));
}

function permuteRows(rows, seed) {
  const next = rows.slice();
  let state = (seed + 1) >>> 0;
  for (let i = next.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (i + 1);
    const item = next[i];
    next[i] = next[swapIndex];
    next[swapIndex] = item;
  }
  return next;
}

async function runCase(name, fn) {
  target.textContent = "";
  resetDebugState();
  enableDebug({ strict: true });
  await fn();
  const snapshot = assertNoReactiveLeaks(name);
  const nodes = countNodes(target);
  if (nodes !== 0) {
    throw new Error(`${name} left ${nodes} DOM node(s) in the target`);
  }
  return { name, snapshot, nodes };
}

async function runMemoryBenchmarks() {
  const summary = [];
  const failures = [];

  const cases = [
    ["mount/unmount leak stress", async () => {
      for (let i = 0; i < 1000; i++) {
        const dispose = mount(() => html`<div>${Array.from({ length: 25 }, (_, j) => html`<span>${i}:${j}</span>`)}</div>`, target);
        dispose();
      }
    }],
    ["keyed reorder churn leak stress", async () => {
      const [rows, setRows] = signal(makeRows(250));
      const dispose = mount(() => html`<table><tbody>${mapArray(rows, row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`, row => row.id, { reactiveItems: false, uniqueKeys: true })}</tbody></table>`, target);
      for (let i = 0; i < 1000; i++) {
        setRows(rows().slice().reverse());
      }
      dispose();
    }],
    ["keyed permutation correctness and leak soak", async () => {
      let expected = makeRows(96);
      const [rows, setRows] = signal(expected);
      const dispose = mount(() => html`<ul>${mapArray(rows, row => html`<li data-row=${row.id}>${row.label}</li>`, row => row.id, { reactiveItems: false, uniqueKeys: true })}</ul>`, target);
      for (let cycle = 0; cycle < 2000; cycle++) {
        expected = permuteRows(expected, cycle);
        setRows(expected);
        const actual = Array.from(target.querySelectorAll("li"), node => Number(node.dataset.row));
        const wanted = expected.map(row => row.id);
        if (actual.length !== wanted.length || actual.some((id, index) => id !== wanted[index])) {
          throw new Error(`keyed permutation mismatch at cycle ${cycle}`);
        }
      }
      dispose();
    }],
    ["conditional teardown leak stress", async () => {
      for (let i = 0; i < 1000; i++) {
        const [show, setShow] = signal(true);
        const dispose = mount(() => html`<section>${() => show() ? Array.from({ length: 8 }, (_, j) => html`<button onclick=${() => j}>${j}</button>`) : null}</section>`, target);
        setShow(false);
        dispose();
      }
    }],
    ["resource cancellation leak stress", async () => {
      const controls = [];
      for (let i = 0; i < 200; i++) {
        const [, control] = createResource(({ signal }) => new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          }, { once: true });
          setTimeout(() => resolve(i), 0);
        }), {
          key: `memory-resource-${i}-${Date.now()}`,
          revalidateOnFocus: false,
          revalidateOnReconnect: false
        });
        controls.push(control);
        control.mutate(i);
      }
      await Promise.resolve();
    }],
    ["resource cache retention stress", async () => {
      const original = configureResourceCache();
      try {
        configureResourceCache({ maxEntries: 64 });
        for (let i = 0; i < 512; i++) {
          await prefetchResource(`memory-cache-${i}`, async () => ({ index: i }), { force: true });
        }
        const bounded = configureResourceCache();
        if (bounded.size > bounded.maxEntries) {
          throw new Error(`resource cache retained ${bounded.size} entries (limit ${bounded.maxEntries})`);
        }
      } finally {
        configureResourceCache({ maxEntries: original.maxEntries });
      }
    }],
    ["unowned resource disposal stress", async () => {
      for (let i = 0; i < 2000; i++) {
        const [, controls] = createResource(({ signal }) => new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("disposed");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        }), {
          key: `unowned-dispose-${i}`,
          revalidateOnFocus: false,
          revalidateOnReconnect: false
        });
        controls.dispose();
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }],
    ["island lifecycle disposal stress", async () => {
      for (let i = 0; i < 1000; i++) {
        const [visible, setVisible] = signal(true);
        const [value, setValue] = signal(0);
        const dispose = mount(() => html`<section>${() => visible() ? Island({
          id: `memory-island-${i}`,
          children: () => html`<button>${value()}</button>`
        }) : null}</section>`, target);
        setValue(1);
        setVisible(false);
        dispose();
      }
      await Promise.resolve();
    }]
  ];

  for (const [name, fn] of cases) {
    try {
      summary.push(await runCase(name, fn));
    } catch (err) {
      failures.push(`${name}: ${err.message || err}`);
    }
  }

  window.__CACHOU_MEMORY_RESULTS__ = { summary, failures };
  results.textContent = JSON.stringify(window.__CACHOU_MEMORY_RESULTS__, null, 2);
  const encodedFailures = failures.map(item => encodeURIComponent(item)).join(",");
  document.title = `CACHOU_MEMORY_DONE:${summary.length}:${failures.length}:${encodedFailures}`;
}

runButton.addEventListener("click", () => runMemoryBenchmarks());
runMemoryBenchmarks();
