import {
  assertNoReactiveLeaks,
  createResource,
  enableDebug,
  html,
  mapArray,
  mount,
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
      for (let i = 0; i < 200; i++) {
        const dispose = mount(() => html`<div>${Array.from({ length: 25 }, (_, j) => html`<span>${i}:${j}</span>`)}</div>`, target);
        dispose();
      }
    }],
    ["keyed reorder churn leak stress", async () => {
      const [rows, setRows] = signal(makeRows(250));
      const dispose = mount(() => html`<table><tbody>${mapArray(rows, row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`, row => row.id, { reactiveItems: false, uniqueKeys: true })}</tbody></table>`, target);
      for (let i = 0; i < 40; i++) {
        setRows(rows().slice().reverse());
      }
      dispose();
    }],
    ["resource cancellation leak stress", async () => {
      const controls = [];
      for (let i = 0; i < 50; i++) {
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
