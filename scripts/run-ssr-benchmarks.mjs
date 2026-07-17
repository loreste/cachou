import { performance } from "node:perf_hooks";
import {
  createResource,
  dehydrate,
  html,
  renderToStream,
  renderToString,
  renderToStringAsync,
  getSSRHead,
  useHead,
  createSSRContext
} from "../src/index.js";

const sampleCount = Math.max(3, Number(process.env.CACHOU_SSR_BENCH_SAMPLES || 5));
const scale = Math.max(0.01, Number(process.env.CACHOU_SSR_BENCH_SCALE || 1));
const concurrentRequests = Math.max(4, Number(process.env.CACHOU_SSR_CONCURRENCY || 32));

const cases = [
  {
    name: "static string",
    iterations: Math.round(1000 * scale),
    run() {
      return String(renderToString(() => html`<main><h1>CachouJS</h1><p>Fast SSR.</p></main>`));
    },
    expected: "<main>"
  },
  {
    name: "one-pass preload",
    iterations: Math.round(500 * scale),
    run() {
      return renderToStringAsync(data => html`<main><h1>${data.title}</h1><p>${data.body}</p></main>`, {
        path: "/bench",
        request: { id: "ssr-benchmark" },
        preload: () => ({ title: "CachouJS", body: "Fast SSR." })
      });
    },
    expected: "<h1>CachouJS</h1>"
  },
  {
    name: "async resource rerender",
    iterations: Math.round(250 * scale),
    run() {
      return renderToStringAsync(() => {
        const [message] = createResource(async () => "ready");
        return html`<main><p>${message}</p></main>`;
      });
    },
    expected: "<p>ready</p>"
  },
  {
    name: "streaming resource",
    iterations: Math.round(250 * scale),
    async run() {
      const stream = renderToStream(() => {
        const [message] = createResource(async () => "ready");
        return html`<main><p>${message}</p></main>`;
      }, { path: "/stream" });
      const reader = stream.getReader?.();
      let output = "";
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          output += typeof chunk.value === "string" ? chunk.value : decoder.decode(chunk.value);
        }
      } else {
        for await (const chunk of stream) output += String(chunk);
      }
      return output;
    },
    expected: "<p>ready</p>"
  },
  {
    name: "concurrent request isolation",
    iterations: Math.round(20 * scale),
    async run() {
      const results = await Promise.all(Array.from({ length: concurrentRequests }, async (_, index) => {
        const id = `request-${index}`;
        const context = createSSRContext();
        const output = await renderToStringAsync(() => {
          useHead({ title: id });
          const [data] = createResource(async ({ request }) => {
            await new Promise(resolve => setTimeout(resolve, index % 3));
            return `${request.id}:data`;
          });
          return html`<main><p>${data}</p></main>`;
        }, {
          context,
          path: `/${id}`,
          request: { id }
        });
        return {
          id,
          output: String(output),
          state: dehydrate(context),
          head: getSSRHead(context)
        };
      }));

      for (const result of results) {
        const expected = `${result.id}:data`;
        if (!result.output.includes(`<p>${expected}</p>`)) {
          throw new Error(`SSR output lost request isolation for ${result.id}`);
        }
        if (!result.state.includes(expected) || !result.head.includes(`<title>${result.id}</title>`)) {
          throw new Error(`SSR metadata/state lost request isolation for ${result.id}`);
        }
      }
      return results[0].output;
    },
    expected: "request-0:data"
  }
];

function percentile(values, fraction) {
  const index = Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1);
  return values[index];
}

async function measure(testCase) {
  const warmup = Math.min(10, testCase.iterations);
  for (let i = 0; i < warmup; i++) await testCase.run();

  const samples = [];
  let lastOutput = "";
  for (let sample = 0; sample < sampleCount; sample++) {
    const startedAt = performance.now();
    for (let i = 0; i < testCase.iterations; i++) {
      lastOutput = await testCase.run();
    }
    samples.push(performance.now() - startedAt);
  }
  samples.sort((a, b) => a - b);
  if (!String(lastOutput).includes(testCase.expected)) {
    throw new Error(`${testCase.name} produced unexpected output`);
  }
  const median = percentile(samples, 0.5);
  return {
    name: testCase.name,
    iterations: testCase.iterations,
    samples,
    medianMs: median,
    p95Ms: percentile(samples, 0.95),
    opsPerSecond: testCase.iterations / (median / 1000)
  };
}

for (const testCase of cases) {
  const result = await measure(testCase);
  console.log(
    `${result.name}: ${result.medianMs.toFixed(2)}ms median for ${result.iterations} iterations ` +
    `(${result.opsPerSecond.toFixed(0)} ops/s, p95 ${result.p95Ms.toFixed(2)}ms)`
  );
}

console.log(`SSR benchmarks: ${cases.length}/${cases.length} passed (${sampleCount} samples)`);
