import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createSSRContext,
  runWithSSRContext,
  runWithSSRContextAsync,
  renderToStringAsync,
  renderToStream,
  dehydrate,
  getSSRHead,
  createResource,
  html,
  onCleanup,
  useHead,
  configureRouter,
  back,
  getPath
} from "../../src/index.js";
import { applyNavigation } from "../../src/router-state.js";
import { getLastSSRContext, getSSRContext, resetGlobalSSRFallback } from "../../src/ssr-context.js";

describe("SSR concurrent isolation", () => {
  async function collectStream(stream) {
    const decoder = new TextDecoder();
    let output = "";
    if (typeof stream?.getReader === "function") {
      const reader = stream.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output += decoder.decode(chunk.value);
      }
      return output;
    }
    for await (const chunk of stream) output += String(chunk);
    return output;
  }

  it("reuses the active context for nested scopes and restores switched contexts", async () => {
    const outer = createSSRContext();
    const inner = createSSRContext();
    const seen = [];

    runWithSSRContext(outer, () => {
      seen.push(getSSRContext() === outer);
      runWithSSRContext(outer, () => {
        seen.push(getSSRContext() === outer);
      });
      runWithSSRContext(inner, () => {
        seen.push(getSSRContext() === inner);
      });
      seen.push(getSSRContext() === outer);
    });

    await runWithSSRContextAsync(outer, async () => {
      seen.push(getSSRContext() === outer);
      await runWithSSRContextAsync(outer, async () => {
        await Promise.resolve();
        seen.push(getSSRContext() === outer);
      });
      await runWithSSRContextAsync(inner, async () => {
        await Promise.resolve();
        seen.push(getSSRContext() === inner);
      });
      seen.push(getSSRContext() === outer);
    });

    assert.deepEqual(seen, [true, true, true, true, true, true, true, true]);
  });

  it("keeps separate caches under overlapping async work", async () => {
    const a = createSSRContext();
    const b = createSSRContext();

    await Promise.all([
      runWithSSRContextAsync(a, async () => {
        a.ssrCache[0] = "from-a";
        await new Promise(r => setTimeout(r, 15));
        assert.equal(a.ssrCache[0], "from-a");
      }),
      runWithSSRContextAsync(b, async () => {
        b.ssrCache[0] = "from-b";
        await new Promise(r => setTimeout(r, 5));
        assert.equal(b.ssrCache[0], "from-b");
      })
    ]);

    assert.equal(a.ssrCache[0], "from-a");
    assert.equal(b.ssrCache[0], "from-b");
  });

  it("keeps memory history isolated across concurrent SSR contexts", async () => {
    const a = createSSRContext();
    const b = createSSRContext();

    await Promise.all([
      runWithSSRContextAsync(a, async () => {
        configureRouter({ history: "memory", initialPath: "/a" });
        applyNavigation("/a/next");
        await new Promise(resolve => setTimeout(resolve, 1));
        assert.equal(back(), true);
        assert.equal(getPath(), "/a");
      }),
      runWithSSRContextAsync(b, async () => {
        configureRouter({ history: "memory", initialPath: "/b" });
        applyNavigation("/b/next");
        await new Promise(resolve => setTimeout(resolve, 1));
        assert.equal(back(), true);
        assert.equal(getPath(), "/b");
      })
    ]);

    assert.equal(a.memoryEntries.map(entry => entry.path).join(","), "/a,/a/next");
    assert.equal(b.memoryEntries.map(entry => entry.path).join(","), "/b,/b/next");
  });

  it("dehydrate works after renderToStringAsync", async () => {
    const html = await renderToStringAsync(() => "page");
    assert.equal(html, "page");
    const script = dehydrate();
    assert.match(script, /__CACHOU_STATE__/);
  });

  it("disposes the discovery pass before owning the final SSR pass", async () => {
    const events = [];
    let renderCount = 0;
    const output = await renderToStringAsync(() => {
      const pass = ++renderCount;
      onCleanup(() => events.push(`cleanup:${pass}`));
      const [data] = createResource(async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return "ready";
      });
      return html`<p>${data}</p>`;
    });

    assert.equal(output, "<p>ready</p>");
    assert.deepEqual(events, ["cleanup:1", "cleanup:2"]);
  });

  it("fails closed instead of serializing another concurrent request", async () => {
    const renderRequest = async (id, preloadDelay, serializeDelay) => {
      await renderToStringAsync(data => `<p>${data.id}</p>`, {
        request: { id },
        preload: async () => {
          await new Promise(resolve => setTimeout(resolve, preloadDelay));
          return { id };
        }
      });
      await new Promise(resolve => setTimeout(resolve, serializeDelay));
      assert.throws(
        () => dehydrate(),
        /no unambiguous completed SSR output context/,
        `${id} must not serialize an implicit concurrent context`
      );
      assert.throws(
        () => getSSRHead(),
        /no unambiguous completed SSR output context/,
        `${id} must not read an implicit concurrent head`
      );
    };

    try {
      await Promise.all([
        renderRequest("A", 5, 25),
        renderRequest("B", 20, 40)
      ]);
    } finally {
      resetGlobalSSRFallback();
    }
  });

  it("supports explicit serialization contexts for concurrent servers", async () => {
    const context = createSSRContext();
    const output = await renderToStringAsync(() => "explicit", { context });
    assert.equal(output, "explicit");
    context.ssrCache[0] = "request-local";
    assert.match(dehydrate(context), /request-local/);
    assert.equal(getSSRHead(context), "");
  });

  it("does not retain request-only state in the implicit serialization snapshot", async () => {
    const context = createSSRContext();
    try {
      const output = await renderToStringAsync(() => {
        const [data] = createResource(async () => "request-secret", { key: "snapshot-resource" });
        useHead({ title: "snapshot" });
        return html`<p>${data}</p>`;
      }, {
        context,
        request: { id: "request-secret", authorization: "Bearer secret" }
      });

      assert.match(output, /request-secret/);
      const snapshot = getLastSSRContext();
      assert.notEqual(snapshot, context, "Implicit serialization does not retain the full request context");
      assert.equal(snapshot.request, null, "Request object is not retained by the implicit snapshot");
      assert.equal(snapshot.resourceCache.size, 0, "Resource cache is not retained by the implicit snapshot");
      assert.equal(snapshot.resourceInflight.size, 0, "Inflight resource map is not retained by the implicit snapshot");
      assert.equal(snapshot.routeData, undefined, "Route data is not retained by the implicit snapshot");
      assert.match(dehydrate(), /request-secret/, "Implicit dehydration still reads request-local serialized state");
      assert.match(getSSRHead(), /<title>snapshot<\/title>/, "Implicit head serialization still works");
    } finally {
      resetGlobalSSRFallback();
    }
  });

  it("does not reuse a previous request after a render failure", async () => {
    const context = createSSRContext();
    await renderToStringAsync(() => "previous", { context });
    context.ssrCache[0] = "previous-request-state";

    await assert.rejects(
      renderToStringAsync(() => {
        throw new Error("render failed");
      }),
      /render failed/
    );
    assert.throws(() => dehydrate(), /no unambiguous completed SSR output context/);
    resetGlobalSSRFallback();
  });

  it("does not publish state after an aborted async render", async () => {
    const controller = new AbortController();
    const context = createSSRContext();
    try {
      const render = renderToStringAsync(() => {
        const [data] = createResource(() => new Promise(resolve => {
          setTimeout(() => resolve("late"), 20);
        }));
        return html`<p>${data}</p>`;
      }, { context, signal: controller.signal });

      await new Promise(resolve => setTimeout(resolve, 0));
      controller.abort();
      await assert.rejects(render, error => error?.name === "AbortError");
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(context.pendingResources.size, 0);
      assert.deepEqual(Object.keys(context.ssrCache), []);
    } finally {
      resetGlobalSSRFallback();
    }
  });

  it("propagates external stream cancellation and releases request work", async () => {
    const controller = new AbortController();
    const context = createSSRContext();
    let aborted = false;
    try {
      const stream = renderToStream(() => {
        const [data] = createResource(({ signal }) => new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
          setTimeout(() => resolve("late"), 20);
        }));
        return html`<p>${data}</p>`;
      }, { context, signal: controller.signal });
      const reader = stream.getReader();
      const first = await reader.read();
      assert.equal(first.done, false);
      controller.abort();
      await reader.cancel();
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(aborted, true);
      assert.equal(context.pendingResources.size, 0);
    } finally {
      resetGlobalSSRFallback();
    }
  });

  it("isolates concurrent streams, final head metadata, and dehydrated state", async () => {
    const requestCount = 24;
    const results = await Promise.all(Array.from({ length: requestCount }, (_, index) => {
      const id = `stream-${index}`;
      const context = createSSRContext();
      // progressive:false → single final document (isolation assertions on static HTML)
      const stream = renderToStream(() => {
        const [data] = createResource(async ({ request }) => {
          await new Promise(resolve => setTimeout(resolve, index % 3));
          return `${request.id}:data`;
        });
        useHead({ title: () => `${id} ${data() || "loading"}` });
        return html`<p>${data}</p>`;
      }, { context, request: { id }, path: `/${id}`, progressive: false });
      return collectStream(stream).then(output => ({ id, output }));
    }));

    for (const result of results) {
      assert.match(result.output, new RegExp(`<title>${result.id} ${result.id}:data</title>`));
      assert.match(result.output, new RegExp(`<p>${result.id}:data</p>`));
      assert.match(result.output, new RegExp(`\\"0\\":\\"${result.id}:data\\"`));
      for (const other of results) {
        if (other.id === result.id) continue;
        assert.equal(result.output.includes(`<title>${other.id} `), false, `${result.id} stream head contains ${other.id}`);
        assert.equal(result.output.includes(`<p>${other.id}:data</p>`), false, `${result.id} stream body contains ${other.id}`);
        assert.equal(result.output.includes(`${other.id}:data`), false, `${result.id} stream state contains ${other.id}`);
      }
    }
  });

  it("isolates a high-concurrency resource, head, and state burst", async () => {
    const requestCount = 64;
    try {
      const results = await Promise.all(Array.from({ length: requestCount }, (_, index) => {
        const id = `request-${index}`;
        const context = createSSRContext();
        return renderToStringAsync(() => {
          useHead({ title: id });
          const [data] = createResource(async ({ request }) => {
            await new Promise(resolve => setTimeout(resolve, index % 4));
            return `${request.id}:data`;
          });
          return html`<p>${data}</p>`;
        }, {
          context,
          request: { id },
          path: `/${id}`
        }).then(output => ({
          id,
          output,
          state: dehydrate(context),
          head: getSSRHead(context)
        }));
      }));

      for (const result of results) {
        assert.match(result.output, new RegExp(`<p>${result.id}:data</p>`));
        assert.match(result.state, new RegExp(`\\"0\\":\\"${result.id}:data\\"`));
        assert.match(result.head, new RegExp(`<title>${result.id}</title>`));
        for (const other of results) {
          if (other.id === result.id) continue;
          assert.equal(result.state.includes(`\"${other.id}:data\"`), false, `${result.id} state contains ${other.id}`);
          assert.equal(result.head.includes(`<title>${other.id}</title>`), false, `${result.id} head contains ${other.id}`);
        }
      }
    } finally {
      resetGlobalSSRFallback();
    }
  });
});
