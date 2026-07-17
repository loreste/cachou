import { createCompiledStatic, html, htmlStatic, mapArray, mount, scheduleTask, signal } from "../src/index.js";

const results = document.getElementById("results");
const target = document.getElementById("target");
const runButton = document.getElementById("run");
let baselines = {};
// Thresholds are tunable via query (?ratio=&slackMs=). CI runners are noisier than
// developer machines, so the harness passes looser values there.
const benchParams = new URLSearchParams(location.search);
const allowedRegressionRatio = Math.max(1, Number(benchParams.get("ratio") || 1.5) || 1.5);
const allowedRegressionMs = Math.max(0, Number(benchParams.get("slackMs") || 5) || 5);
const sampleCount = Math.max(1, Number(benchParams.get("samples") || 3) || 3);
const staticCreationCount = Math.max(100, Number(benchParams.get("staticCount") || 1000) || 1000);

async function measure(name, fn, notes = "") {
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    target.replaceChildren();
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const duration = samples[Math.floor(samples.length / 2)];
  const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const variance = samples.reduce((total, sample) => total + Math.pow(sample - mean, 2), 0) / samples.length;
  const baseline = baselines[name];
  const delta = typeof baseline === "number" ? duration - baseline : null;
  results.appendChild(html`
    <tr>
      <td>${name}</td>
      <td>${duration.toFixed(2)} ms</td>
      <td>${typeof baseline === "number" ? `${baseline.toFixed(2)} ms` : "n/a"}</td>
      <td>${delta === null ? "n/a" : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} ms`}</td>
      <td>${notes}</td>
    </tr>
  `);
  return {
    name,
    duration,
    baseline,
    delta,
    notes,
    stats: {
      samples: samples.length,
      min: samples[0],
      max: samples[samples.length - 1],
      mean,
      median: duration,
      stddev: Math.sqrt(variance)
    }
  };
}

function makeRows(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({ id: i + 1, label: `Row ${i + 1}` });
  }
  return rows;
}

const staticCardMarkup = '<article class="card"><h2>Static card</h2><p>Compiled DOM</p></article>';
function makeStaticCard() {
  const article = document.createElement("article");
  article.setAttribute("class", "card");
  const heading = document.createElement("h2");
  heading.appendChild(document.createTextNode("Static card"));
  article.appendChild(heading);
  const paragraph = document.createElement("p");
  paragraph.appendChild(document.createTextNode("Compiled DOM"));
  article.appendChild(paragraph);
  return article;
}

async function runBenchmarks() {
  results.replaceChildren();
  const summary = [];

  summary.push(await measure("signal update fanout", () => {
    const [value, setValue] = signal(0);
    const nodes = [];
    for (let i = 0; i < 1000; i++) {
      nodes.push(html`<span>${value}</span>`);
    }
    target.append(...nodes);
    for (let i = 1; i <= 100; i++) {
      setValue(i);
    }
  }, "1,000 text subscribers x 100 updates"));

  summary.push(await measure("attribute binding fanout", () => {
    const [active, setActive] = signal(false);
    const nodes = [];
    for (let i = 0; i < 1000; i++) {
      nodes.push(html`<button class=${() => active() ? "active" : ""}>${i}</button>`);
    }
    target.append(...nodes);
    for (let i = 0; i < 100; i++) {
      setActive(i % 2 === 0);
    }
  }, "1,000 class subscribers x 100 updates"));

  summary.push(await measure("compiled static DOM creation", () => {
    const nodes = [];
    for (let i = 0; i < staticCreationCount; i++) {
      nodes.push(createCompiledStatic(staticCardMarkup, makeStaticCard));
    }
    target.append(...nodes);
  }, `${staticCreationCount} compiler-shaped factories`));

  summary.push(await measure("htmlStatic DOM creation", () => {
    const nodes = [];
    for (let i = 0; i < staticCreationCount; i++) {
      nodes.push(htmlStatic(staticCardMarkup));
    }
    target.append(...nodes);
  }, `${staticCreationCount} cached template clones`));

  summary.push(await measure("generic template DOM creation", () => {
    const nodes = [];
    for (let i = 0; i < staticCreationCount; i++) {
      nodes.push(html`<article class="card"><h2>Static card</h2><p>Compiled DOM</p></article>`);
    }
    target.append(...nodes);
  }, `${staticCreationCount} runtime template clones`));

  summary.push(await measure("list append keyed", () => {
    const [rows, setRows] = signal(makeRows(1000));
    const table = html`<table><tbody>${mapArray(rows, row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`, row => row.id)}</tbody></table>`;
    target.appendChild(table);
    setRows([...rows(), ...makeRows(1000).map(row => ({ id: row.id + 1000, label: row.label }))]);
  }, "1,000 rows -> 2,000 rows"));

  summary.push(await measure("list prepend keyed", () => {
    const [rows, setRows] = signal(makeRows(1000).map(row => ({ id: row.id + 1000, label: row.label })));
    const table = html`<table><tbody>${mapArray(rows, row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`, row => row.id)}</tbody></table>`;
    target.appendChild(table);
    setRows([...makeRows(1000), ...rows()]);
  }, "Prepend 1,000 rows before 1,000 existing rows"));

  summary.push(await measure("list reverse keyed", () => {
    const [rows, setRows] = signal(makeRows(1000));
    const table = html`<table><tbody>${mapArray(rows, row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`, row => row.id)}</tbody></table>`;
    target.appendChild(table);
    setRows([...rows()].reverse());
  }, "Reverse 1,000 stable row objects"));

  summary.push(await measure("list delete middle keyed", () => {
    const [rows, setRows] = signal(makeRows(1000));
    const table = html`<table><tbody>${mapArray(rows, row => html`<tr><td>${row.id}</td><td>${row.label}</td></tr>`, row => row.id)}</tbody></table>`;
    target.appendChild(table);
    setRows(rows().filter(row => row.id < 400 || row.id > 600));
  }, "Remove 201 rows from the middle"));

  summary.push(await measure("conditional child teardown", () => {
    const [show, setShow] = signal(true);
    const dispose = mount(() => html`<section>${() => show() ? Array.from({ length: 1000 }, (_, i) => html`<span>${i}</span>`) : null}</section>`, target);
    setShow(false);
    if (target.querySelector("span")) {
      throw new Error("Conditional children did not leave the DOM");
    }
    dispose();
  }, "Remove 1,000 conditional children in one update"));

  summary.push(await measure("scheduler interruption", async () => {
    const committed = [];
    const cancelled = [];
    const tasks = [];
    for (let i = 0; i < 100; i++) {
      const task = scheduleTask(async ({ signal, yieldNow }) => {
        await yieldNow();
        if (signal.aborted) {
          cancelled.push(i);
          return;
        }
        committed.push(i);
      }, { priority: "background" });
      if (i < 90) {
        task.cancel();
      }
      tasks.push(task.finished);
    }
    await Promise.all(tasks);
    if (committed.length !== 10) {
      throw new Error(`Expected 10 committed scheduled tasks, got ${committed.length}`);
    }
  }, "Cancel 90 queued background tasks, commit 10"));

  console.table(summary);
  const regressions = summary.filter(item => {
    if (typeof item.baseline !== "number") return false;
    const allowed = Math.max(item.baseline * allowedRegressionRatio, item.baseline + allowedRegressionMs);
    return item.duration > allowed;
  });
  window.__CACHOU_BENCH_RESULTS__ = {
    total: summary.length,
    failed: regressions.length,
    results: summary
  };
  const regressionDetails = regressions
    .map(item => encodeURIComponent(`${item.name}=${item.duration.toFixed(2)}ms baseline=${item.baseline.toFixed(2)}ms`))
    .join(",");
  document.title = `CACHOU_BENCH_DONE:${summary.length}:${regressions.length}:${regressionDetails}`;
}

async function loadBaselines() {
  try {
    const res = await fetch("./baselines.json", { cache: "no-store" });
    if (res.ok) {
      baselines = await res.json();
    }
  } catch (err) {
    baselines = {};
  }
}

runButton.addEventListener("click", () => runBenchmarks());
loadBaselines().then(runBenchmarks);
