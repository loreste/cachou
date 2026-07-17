import { html } from "../../src/index.js";
import { scenarios } from "./scenarios.js";
import { cachouAdapter } from "./adapters/cachou.js";
import { vanillaAdapter } from "./adapters/vanilla.js";
import { reactAdapter } from "./adapters/react.js";
import { vueAdapter } from "./adapters/vue.js";
import { preactAdapter } from "./adapters/preact.js";
import { solidAdapter } from "./adapters/solid.js";
import { svelteAdapter } from "./adapters/svelte.js";

const adapters = [vanillaAdapter, cachouAdapter, reactAdapter, vueAdapter, preactAdapter, solidAdapter, svelteAdapter];
const runButton = document.getElementById("run");
const results = document.getElementById("results");
const target = document.getElementById("target");
const sampleCount = Math.max(1, Number(new URLSearchParams(location.search).get("samples") || 3));

function cleanupTarget() {
  target.replaceChildren();
}

async function measure(adapter, scenario) {
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    cleanupTarget();
    const start = performance.now();
    const cleanup = await scenario.run(adapter, target);
    samples.push(performance.now() - start);
    if (typeof cleanup === "function") {
      await cleanup();
    }
    cleanupTarget();
  }
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((total, sample) => total + sample, 0);
  const mean = sum / samples.length;
  const variance = samples.reduce((total, sample) => total + Math.pow(sample - mean, 2), 0) / samples.length;
  const p95Index = Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1);
  return {
    duration: samples[Math.floor(samples.length / 2)],
    stats: {
      samples: samples.length,
      min: samples[0],
      max: samples[samples.length - 1],
      median: samples[Math.floor(samples.length / 2)],
      mean,
      p95: samples[p95Index],
      stddev: Math.sqrt(variance)
    },
    samples
  };
}

async function runComparison() {
  results.replaceChildren();
  const summary = [];
  const floors = new Map();
  const failures = [];

  for (const scenario of scenarios) {
    for (const adapter of adapters) {
      try {
        const measured = await measure(adapter, scenario);
        const duration = measured.duration;
        if (adapter === vanillaAdapter) {
          floors.set(scenario.name, duration);
        }
        const floor = floors.get(scenario.name);
        const relative = floor ? duration / floor : 1;
        const item = {
          adapter: adapter.name,
          scenario: scenario.name,
          duration,
          relative,
          stats: measured.stats,
          samples: measured.samples,
          notes: scenario.notes
        };
        summary.push(item);
        results.appendChild(renderRow(item));
      } catch (err) {
        const failure = `${adapter.name} ${scenario.name}: ${err.message || err}`;
        failures.push(failure);
        results.appendChild(renderRow({
          adapter: adapter.name,
          scenario: scenario.name,
          duration: NaN,
          relative: NaN,
          notes: failure
        }));
      }
    }
  }

  window.__CACHOU_COMPARE_RESULTS__ = { summary, failures };
  fetch("/__cachou_compare_results__", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(window.__CACHOU_COMPARE_RESULTS__)
  }).catch(() => {});
  const encodedFailures = failures.map(item => encodeURIComponent(item)).join(",");
  document.title = `CACHOU_COMPARE_DONE:${adapters.length}:${scenarios.length}:${failures.length}:${encodedFailures}`;
}

function renderRow(item) {
  return html`
    <tr>
      <td>${item.adapter}</td>
      <td>${item.scenario}</td>
      <td>${Number.isFinite(item.duration) ? `${item.duration.toFixed(2)} ms` : "failed"}</td>
      <td>${Number.isFinite(item.relative) ? `${item.relative.toFixed(2)}x` : "n/a"}</td>
      <td>${item.stats ? `p95 ${item.stats.p95.toFixed(2)} ms / σ ${item.stats.stddev.toFixed(2)}` : "n/a"}</td>
      <td>${item.notes}</td>
    </tr>
  `;
}

runButton.addEventListener("click", () => runComparison());
runComparison();
