import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  signal,
  effect,
  onCleanup,
  memo,
  batch,
  createRoot,
  mapArray,
  createResource,
  configureResourceCache,
  prefetchResource,
  invalidateResource,
  scheduleTask,
  html,
  renderToString,
  renderToStringAsync,
  renderToStream,
  Island,
  useHead,
  getRequestEvent,
  setRequestEvent,
  dehydrate,
  getSSRHead,
  configureLogger,
  createLogger,
  configureTracing,
  createTracer,
  startSpan,
  runWithSpan,
  getActiveSpan,
  getSpanTraceparent,
  parseTraceparent,
  formatTraceparent,
  createSSRContext,
  runWithSSRContextAsync,
  resetResourceCounter
} from "../../src/index.js";

describe("signal", () => {
  it("reads and writes", () => {
    const [count, setCount] = signal(0);
    assert.equal(count(), 0);
    setCount(1);
    assert.equal(count(), 1);
    setCount(v => v + 1);
    assert.equal(count(), 2);
  });

  it("skips equal values", () => {
    const [count, setCount] = signal(1);
    let runs = 0;
    createRoot(dispose => {
      effect(() => {
        count();
        runs++;
      });
      setCount(1);
      assert.equal(runs, 1);
      setCount(2);
      assert.equal(runs, 2);
      dispose();
    });
  });

  it("supports equals false for always-notify signals", () => {
    const [count, setCount] = signal(1, { equals: false });
    let runs = 0;
    const dispose = createRoot(disposeRoot => {
      effect(() => {
        count();
        runs++;
      });
      return disposeRoot;
    });

    setCount(1);
    assert.equal(runs, 2);
    dispose();
  });

  it("keeps direct dispatch safe when subscribers mutate the signal", () => {
    const [value, setValue] = signal(0);
    const signalMeta = value.$$cachouSignal;
    const calls = [];
    const second = () => calls.push("second");
    const first = () => {
      calls.push("first");
      signalMeta.unsubscribe(first);
    };

    signalMeta.subscribe(first);
    signalMeta.subscribe(second);
    setValue(1);
    assert.deepEqual(calls, ["first", "second"]);
    setValue(2);
    assert.deepEqual(calls, ["first", "second", "second"]);
    signalMeta.unsubscribe(second);
    assert.equal(signalMeta.subscribers.size, 0);
    setValue(3);
    assert.deepEqual(calls, ["first", "second", "second"]);
  });

  it("keeps direct subscriber churn isolated after compaction", () => {
    const [value, setValue] = signal(0);
    const signalMeta = value.$$cachouSignal;
    let staleCalls = 0;

    for (let i = 0; i < 512; i++) {
      const subscriber = () => staleCalls++;
      signalMeta.subscribe(subscriber);
      signalMeta.unsubscribe(subscriber);
    }

    assert.equal(signalMeta.subscribers.size, 0);
    setValue(1);
    assert.equal(staleCalls, 0);

    let liveCalls = 0;
    const liveSubscribers = Array.from({ length: 64 }, () => () => liveCalls++);
    for (const subscriber of liveSubscribers) signalMeta.subscribe(subscriber);
    setValue(2);
    assert.equal(liveCalls, 64);
    for (const subscriber of liveSubscribers) signalMeta.unsubscribe(subscriber);
    assert.equal(signalMeta.subscribers.size, 0);
  });

  it("uses the class binding lane without retaining disposed nodes", () => {
    const [active, setActive] = signal(false);
    const signalMeta = active.$$cachouSignal;
    const first = { className: "" };
    const second = { className: "" };
    const firstBinding = signalMeta.subscribeClass(first, "active");
    const secondBinding = signalMeta.subscribeClass(second, "active");

    setActive(true);
    assert.equal(first.className, "active");
    assert.equal(second.className, "active");

    signalMeta.unsubscribeClass(firstBinding);
    setActive(false);
    assert.equal(first.className, "active", "Unsubscribed class bindings are not dispatched");
    assert.equal(second.className, "");

    signalMeta.unsubscribeClass(secondBinding);
    assert.equal(signalMeta.subscribers.size, 0);
  });

  it("batches class bindings and preserves mixed subscriber behavior", () => {
    const [active, setActive] = signal(false);
    const signalMeta = active.$$cachouSignal;
    const node = { className: "" };
    let observed;
    const binding = signalMeta.subscribeClass(node, "active");
    const unsubscribe = value => {
      observed = value;
    };
    signalMeta.subscribe(unsubscribe);

    setActive(true);
    assert.equal(node.className, "active");
    assert.equal(observed, true);

    batch(() => {
      setActive(true);
      setActive(false);
    });

    assert.equal(node.className, "");
    assert.equal(observed, false);
    signalMeta.unsubscribeClass(binding);
    signalMeta.unsubscribe(unsubscribe);
  });

  it("does not retain class bindings when the generic unsubscribe API is used", () => {
    const [active, setActive] = signal(false);
    const signalMeta = active.$$cachouSignal;
    const node = { className: "" };
    const binding = signalMeta.subscribeClass(node, "active");

    signalMeta.unsubscribe(binding);
    setActive(true);

    assert.equal(node.className, "");
    assert.equal(signalMeta.subscribers.size, 0);
  });
});

describe("memo", () => {
  it("lazily recomputes", () => {
    const [n, setN] = signal(2);
    let compute = 0;
    const doubled = memo(() => {
      compute++;
      return n() * 2;
    });
    assert.equal(compute, 0);
    assert.equal(doubled(), 4);
    assert.equal(compute, 1);
    assert.equal(doubled(), 4);
    assert.equal(compute, 1);
    setN(3);
    assert.equal(doubled(), 6);
    assert.equal(compute, 2);
  });

  it("suppresses downstream work when the derived value is equal", () => {
    const [source, setSource] = signal(0);
    const parity = memo(() => source() % 2);
    let runs = 0;

    const dispose = createRoot(disposeRoot => {
      effect(() => {
        parity();
        runs++;
      });
      return disposeRoot;
    });

    assert.equal(runs, 1);
    setSource(2);
    assert.equal(runs, 1);
    setSource(1);
    assert.equal(runs, 2);
    dispose();
  });

  it("supports equals false for always-notify memos", () => {
    const [source, setSource] = signal(0);
    const derived = memo(() => source() % 2, { equals: false });
    let runs = 0;
    const dispose = createRoot(disposeRoot => {
      effect(() => {
        derived();
        runs++;
      });
      return disposeRoot;
    });

    setSource(2);
    assert.equal(runs, 2);
    dispose();
  });

  it("keeps dynamic dependencies while suppressing equal chained results", () => {
    const [usePrimary, setUsePrimary] = signal(false);
    const [primary, setPrimary] = signal(2);
    const [secondary, setSecondary] = signal(1);
    const selected = memo(() => usePrimary() ? primary() : secondary());
    const projected = memo(() => selected() * 2);
    let runs = 0;

    const dispose = createRoot(disposeRoot => {
      effect(() => {
        projected();
        runs++;
      });
      return disposeRoot;
    });

    setPrimary(3);
    assert.equal(runs, 1, "Inactive dependency does not notify");
    setSecondary(2);
    assert.equal(runs, 2);
    setPrimary(2);
    assert.equal(runs, 2, "Inactive dependency can change without notifying");
    setUsePrimary(true);
    assert.equal(runs, 2, "Switching to an equal result suppresses the update");
    setSecondary(3);
    assert.equal(runs, 2, "Old dynamic dependency is removed");
    setPrimary(3);
    assert.equal(runs, 3, "New dynamic dependency remains active");
    dispose();
  });

  it("cleans memo-owned work on equal recompute and root disposal", () => {
    const [source, setSource] = signal(0);
    let computes = 0;
    let cleanups = 0;
    let derived;

    const dispose = createRoot(disposeRoot => {
      derived = memo(() => {
        source();
        computes++;
        onCleanup(() => cleanups++);
        return 1;
      });
      effect(() => derived());
      return disposeRoot;
    });

    setSource(1);
    assert.equal(computes, 2);
    assert.equal(cleanups, 1);
    dispose();
    assert.equal(cleanups, 2);
    setSource(2);
    assert.equal(computes, 2, "Disposed memo no longer tracks source updates");
  });

});

describe("batch", () => {
  it("coalesces updates", () => {
    const [a, setA] = signal(0);
    const [b, setB] = signal(0);
    let runs = 0;
    createRoot(dispose => {
      effect(() => {
        a();
        b();
        runs++;
      });
      assert.equal(runs, 1);
      batch(() => {
        setA(1);
        setB(2);
      });
      assert.equal(runs, 2);
      dispose();
    });
  });

  it("survives repeated root, nested effect, and cleanup cycles", () => {
    for (let cycle = 0; cycle < 2000; cycle++) {
      const [source, setSource] = signal(0);
      const [enabled, setEnabled] = signal(true);
      let childRuns = 0;
      let cleanups = 0;

      createRoot(dispose => {
        effect(() => {
          if (enabled()) {
            effect(() => {
              source();
              childRuns++;
              onCleanup(() => cleanups++);
            });
          }
        });

        setSource(1);
        setEnabled(false);
        setSource(2);
        dispose();
      });

      assert.equal(childRuns, 2);
      assert.equal(cleanups, 2);
    }
  });

  it("disposes owned work when root initialization throws", () => {
    const [source, setSource] = signal(0);
    let runs = 0;

    assert.throws(() => createRoot(() => {
      effect(() => {
        source();
        runs++;
      });
      throw new Error("initializer failed");
    }), /initializer failed/);

    setSource(1);
    assert.equal(runs, 1, "Failed root does not retain its effect");
  });
});

describe("mapArray", () => {
  it("maps items by index by default", () => {
    const [list, setList] = signal([1, 2, 3]);
    const mapped = mapArray(list, item => item * 10);
    assert.deepEqual(mapped(), [10, 20, 30]);
    setList([1, 2, 3, 4]);
    assert.deepEqual(mapped(), [10, 20, 30, 40]);
  });
});

// Additional mapArray / store / flow coverage lives in dedicated unit files.

describe("createResource", () => {
  it("loads async data", async () => {
    await createRoot(async dispose => {
      const [data, { loading }] = createResource(async () => {
        await new Promise(r => setTimeout(r, 5));
        return "ok";
      });
      assert.equal(loading(), true);
      await new Promise(r => setTimeout(r, 20));
      assert.equal(data(), "ok");
      assert.equal(loading(), false);
      dispose();
    });
  });

  it("cancels owned work when its root is disposed", async () => {
    let aborted = false;
    await createRoot(async dispose => {
      createResource(({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          const error = new Error("cancelled");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }));
      dispose();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(aborted, true);
  });

  it("manually disposes an unowned resource and cancels its request", async () => {
    let aborted = false;
    const [, controls] = createResource(({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        const error = new Error("cancelled");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }), { revalidateOnFocus: false, revalidateOnReconnect: false });

    controls.dispose();
    controls.dispose();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(aborted, true);
    await controls.refetch();
    assert.equal(aborted, true, "Disposed resources do not restart work");
  });

  it("bounds unique browser cache keys with LRU eviction", async () => {
    const original = configureResourceCache();
    try {
      configureResourceCache({ maxEntries: 2 });
      let calls = 0;
      const fetcher = async () => `value-${++calls}`;

      await prefetchResource("lru-a", fetcher, { force: true });
      await prefetchResource("lru-b", fetcher, { force: true });
      await prefetchResource("lru-a", fetcher);
      await prefetchResource("lru-c", fetcher, { force: true });

      assert.equal(configureResourceCache().size, 2);
      await prefetchResource("lru-b", fetcher);
      assert.equal(calls, 4, "least-recently-used entry is evicted and refetched");
    } finally {
      configureResourceCache({ maxEntries: original.maxEntries });
    }
  });

  it("does not let an invalidated prefetch delete a newer inflight request", async () => {
    let calls = 0;
    let resolveFirst;
    let resolveSecond;
    const fetcher = () => {
      calls++;
      return new Promise(resolve => {
        if (calls === 1) resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    };

    const first = prefetchResource("inflight-race", fetcher, { dedupe: true, force: true });
    invalidateResource("inflight-race");
    const second = prefetchResource("inflight-race", fetcher, { dedupe: true, force: true });

    resolveFirst("stale");
    await first;
    const third = prefetchResource("inflight-race", fetcher, { dedupe: true, force: true });
    resolveSecond("fresh");

    assert.equal(await second, "fresh");
    assert.equal(await third, "fresh");
    assert.equal(calls, 2, "The newer inflight request remains deduped");
  });

  it("suppresses stale responses across deduped resource instances", async () => {
    let calls = 0;
    let resolveFirst;
    let resolveSecond;
    const fetcher = () => {
      calls++;
      return new Promise(resolve => {
        if (calls === 1) resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    };
    const key = "cross-resource-inflight-race";
    invalidateResource(key);
    const [firstData, firstControls] = createResource(fetcher, {
      key,
      dedupe: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    });
    invalidateResource(key);
    const [secondData, secondControls] = createResource(fetcher, {
      key,
      dedupe: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false
    });

    resolveFirst("stale");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(firstData(), undefined, "Invalidated response does not update the old resource");

    resolveSecond("fresh");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(secondData(), "fresh");
    assert.equal(calls, 2);
    firstControls.dispose();
    secondControls.dispose();
  });

  it("clears loading when disposed mid-flight", async () => {
    let resolveFetch;
    const [, controls] = createResource(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
      { revalidateOnFocus: false, revalidateOnReconnect: false }
    );
    assert.equal(controls.loading(), true);
    controls.dispose();
    assert.equal(controls.loading(), false, "dispose clears stuck loading");
    resolveFetch("late");
    await new Promise(r => setTimeout(r, 5));
    assert.equal(controls.loading(), false);
  });

  it("does not commit after dispose when a late response arrives", async () => {
    let resolveFetch;
    const [data, controls] = createResource(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
      { revalidateOnFocus: false, revalidateOnReconnect: false }
    );
    controls.dispose();
    resolveFetch("should-not-apply");
    await new Promise(r => setTimeout(r, 5));
    assert.equal(data(), undefined);
    assert.equal(controls.error(), null);
  });

  it("prefetchResource aborts when the external signal fires", async () => {
    let aborted = false;
    const ac = new AbortController();
    const promise = prefetchResource(
      "prefetch-abort-" + Date.now(),
      ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            },
            { once: true }
          );
        }),
      { force: true, signal: ac.signal, dedupe: false }
    );
    ac.abort();
    await assert.rejects(() => promise, err => err && err.name === "AbortError");
    assert.equal(aborted, true);
  });

  it("prefetchResource rejects immediately when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    let calls = 0;
    await assert.rejects(
      () =>
        prefetchResource(
          "prefetch-already-aborted",
          () => {
            calls++;
            return Promise.resolve("nope");
          },
          { force: true, signal: ac.signal }
        ),
      err => err && err.name === "AbortError"
    );
    assert.equal(calls, 0);
  });

  it("source-driven resource aborts previous fetch on source change", async () => {
    const [query, setQuery] = signal("a");
    const aborted = [];
    const seen = [];
    let resolveA;
    let resolveB;
    await createRoot(async dispose => {
      const [data] = createResource(
        query,
        (q, { signal }) =>
          new Promise((resolve, reject) => {
            seen.push(q);
            signal.addEventListener(
              "abort",
              () => {
                aborted.push(q);
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              },
              { once: true }
            );
            if (q === "a") resolveA = resolve;
            else resolveB = resolve;
          }),
        { revalidateOnFocus: false, revalidateOnReconnect: false }
      );
      await new Promise(r => setTimeout(r, 5));
      setQuery("b");
      await new Promise(r => setTimeout(r, 5));
      assert.ok(aborted.includes("a"), "previous source fetch aborted");
      resolveA?.("stale-a");
      resolveB?.("fresh-b");
      await new Promise(r => setTimeout(r, 10));
      assert.equal(data(), "fresh-b");
      dispose();
    });
  });
});

describe("owned scheduler work", () => {
  it("commits synchronous work during the scheduler flush", async () => {
    const events = [];
    const task = scheduleTask(() => {
      events.push("committed");
      return 42;
    });

    assert.deepEqual(events, []);
    await task.finished;
    assert.deepEqual(events, ["committed"]);
    assert.equal(task.status, "completed");
  });

  it("reports synchronous task failures through finished", async () => {
    const task = scheduleTask(() => {
      throw new Error("synchronous task failed");
    });

    await assert.rejects(task.finished, /synchronous task failed/);
    assert.equal(task.status, "failed");
  });

  it("cancels queued tasks when their owner is disposed", async () => {
    let task;
    let ran = false;
    createRoot(dispose => {
      task = scheduleTask(() => {
        ran = true;
      });
      dispose();
    });
    await task.finished;
    assert.equal(ran, false);
    assert.equal(task.status, "cancelled");
  });
});

describe("SSR isolation", () => {
  it("escapes island metadata and untrusted children during SSR", () => {
    const output = renderToString(() => Island({
      id: 'island\"><script>alert(1)</script>',
      hydrate: 'load\"><script>alert(2)</script>',
      children: '<img src=x onerror="window.__islandXss=true">'
    }));

    assert.match(output, /data-cachou-island="island&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.match(output, /data-hydrate="load"/);
    assert.match(output, /&lt;img src=x onerror="window.__islandXss=true"&gt;/);
    assert.doesNotMatch(output, /<script>alert\([12]\)/);
  });

  it("does not inspect request trace metadata when tracing is disabled", async () => {
    configureTracing({ enabled: false, exporter: null });
    let reads = 0;
    const request = {
      headers: {
        get() {
          reads++;
          throw new Error("trace metadata should not be read");
        }
      }
    };

    const output = await renderToStringAsync(() => html`<p>no tracing</p>`, { request });
    assert.equal(output, "<p>no tracing</p>");
    assert.equal(reads, 0);
  });

  it("validates W3C trace context and preserves parentage", async () => {
    const exported = [];
    const parentTraceparent = "00-11111111111111111111111111111111-2222222222222222-01";
    configureTracing({ enabled: true, sampleRate: 1, exporter: span => exported.push(span) });
    try {
      const parsed = parseTraceparent(parentTraceparent);
      assert.deepEqual(parsed, {
        traceId: "11111111111111111111111111111111",
        spanId: "2222222222222222",
        traceFlags: 1
      });
      assert.equal(formatTraceparent(parsed), parentTraceparent);
      assert.equal(parseTraceparent("00-00000000000000000000000000000000-2222222222222222-01"), null);
      assert.equal(parseTraceparent("00-11111111111111111111111111111111-0000000000000000-01"), null);
      assert.deepEqual(
        parseTraceparent("01-11111111111111111111111111111111-2222222222222222-01-abcd"),
        parsed,
        "Future traceparent versions preserve the interoperable prefix"
      );
      assert.equal(
        parseTraceparent("00-11111111111111111111111111111111-2222222222222222-01-abcd"),
        null,
        "Version 00 rejects non-standard extra fields"
      );
      assert.equal(
        parseTraceparent("ff-11111111111111111111111111111111-2222222222222222-01"),
        null,
        "The reserved traceparent version is rejected"
      );

      const parent = startSpan("request", {
        traceparent: parentTraceparent,
        attributes: { route: "/orders", authorization: "do-not-export" }
      });
      await runWithSpan(parent, async () => {
        assert.equal(getActiveSpan(), parent);
        assert.match(getSpanTraceparent(), /^00-11111111111111111111111111111111-[0-9a-f]{16}-01$/);
        const child = startSpan("work", { attributes: { token: "do-not-export", count: 2 } });
        child.addEvent("checkpoint", { secret: "do-not-export", count: 2 }).end();
      });
      parent.end();
      assert.equal(await createTracer("test").withSpan("operation", async () => 42), 42);
    } finally {
      configureTracing({ enabled: false, exporter: null });
    }
    assert.equal(exported.length, 3);
    const child = exported.find(span => span.name === "work");
    const parent = exported.find(span => span.name === "request");
    assert.equal(child.parentSpanId, parent.spanId);
    assert.equal(parent.attributes.authorization, undefined);
    assert.equal(child.attributes.token, undefined);
    assert.equal(child.events[0].attributes.secret, undefined);
  });

  it("keeps concurrent SSR traces isolated and exporter failures contained", async () => {
    const exported = [];
    configureTracing({ enabled: true, sampleRate: 1, exporter: span => {
      exported.push(span);
      throw new Error("exporter unavailable");
    }});
    try {
      const makeRequest = id => ({
        headers: { traceparent: `00-${id.repeat(32 / id.length)}-3333333333333333-01` },
        user: { id }
      });
      const [first, second] = await Promise.all([
        renderToStringAsync(() => html`<p>first</p>`, { request: makeRequest("a") }),
        renderToStringAsync(() => html`<p>second</p>`, { request: makeRequest("b") })
      ]);
      assert.equal(first, "<p>first</p>");
      assert.equal(second, "<p>second</p>");
    } finally {
      configureTracing({ enabled: false, exporter: null });
    }
    const ssrSpans = exported.filter(span => span.name === "cachou.ssr.string-async");
    assert.equal(ssrSpans.length, 2);
    assert.notEqual(ssrSpans[0].traceId, ssrSpans[1].traceId);
    assert.equal(exported.some(span => JSON.stringify(span).includes("user")), false);
  });

  it("keeps dehydrate caches separate per context", async () => {
    const ctxA = createSSRContext();
    const ctxB = createSSRContext();

    await Promise.all([
      runWithSSRContextAsync(ctxA, async () => {
        resetResourceCounter();
        createResource(async () => "A");
        await new Promise(r => setTimeout(r, 10));
        ctxA.ssrCache[0] = "A";
      }),
      runWithSSRContextAsync(ctxB, async () => {
        resetResourceCounter();
        createResource(async () => "B");
        await new Promise(r => setTimeout(r, 5));
        ctxB.ssrCache[0] = "B";
      })
    ]);

    assert.equal(ctxA.ssrCache[0], "A");
    assert.equal(ctxB.ssrCache[0], "B");
  });

  it("keeps resource completion and request data in their own context without ALS", async () => {
    const ctxA = createSSRContext();
    const ctxB = createSSRContext();
    const seenRequests = [];

    await Promise.all([
      runWithSSRContextAsync(ctxA, async () => {
        ctxA.request = { id: "a" };
        createResource(async ({ request }) => {
          await new Promise(resolve => setTimeout(resolve, 15));
          seenRequests.push(request.id);
          return "A";
        });
        await new Promise(resolve => setTimeout(resolve, 20));
      }),
      runWithSSRContextAsync(ctxB, async () => {
        ctxB.request = { id: "b" };
        createResource(async ({ request }) => {
          await new Promise(resolve => setTimeout(resolve, 5));
          seenRequests.push(request.id);
          return "B";
        });
        await new Promise(resolve => setTimeout(resolve, 10));
      })
    ]);

    assert.deepEqual(ctxA.ssrCache[0], "A");
    assert.deepEqual(ctxB.ssrCache[0], "B");
    assert.deepEqual(seenRequests.sort(), ["a", "b"]);
  });

  it("renderToStringAsync returns a string", async () => {
    let renders = 0;
    const output = await renderToStringAsync(() => {
      renders++;
      return "hello";
    });
    assert.equal(output, "hello");
    assert.equal(renders, 1);
  });

  it("rerenders async SSR once and does not duplicate head metadata", async () => {
    let renders = 0;
    const output = await renderToStringAsync(() => {
      renders++;
      useHead({ title: "Fast page" });
      const [message] = createResource(async () => "ready");
      return html`<h1>${message}</h1>`;
    });
    assert.equal(renders, 2);
    assert.equal(output, "<h1>ready</h1>");
    assert.equal((getSSRHead().match(/<title>/g) || []).length, 1);
  });

  it("supports one-pass SSR route preloading", async () => {
    let renders = 0;
    const output = await renderToStringAsync(data => {
      renders++;
      return html`<p>${data.message}</p>`;
    }, {
      request: { id: "request-1" },
      preload: async ({ request }) => ({ message: `hello ${request.id}` })
    });
    assert.equal(output, "<p>hello request-1</p>");
    assert.equal(renders, 1);
  });

  it("logs scoped application errors and SSR failures with context", async () => {
    const entries = [];
    configureLogger({ level: "debug", sink: entry => entries.push(entry) });
    try {
      createLogger("test-app").error("application failed", { operation: "render" });
      await assert.rejects(
        renderToStringAsync(() => {
          throw new Error("render exploded");
        }, { path: "/broken" }),
        /render exploded/
      );
    } finally {
      configureLogger({ level: "silent", sink: null });
    }
    assert.equal(entries[0].scope, "test-app");
    assert.equal(entries[0].level, "error");
    const ssrFailure = entries.find(entry => entry.eventType === "ssr-error");
    assert.ok(ssrFailure);
    assert.equal(ssrFailure.path, "/broken");
    assert.match(ssrFailure.error.stack, /render exploded/);
    assert.match(ssrFailure.ssrContextId, /^ssr-/);
  });

  it("does not let an outer request fallback leak into an active context", async () => {
    setRequestEvent({ id: "stale" });
    const context = createSSRContext();
    await runWithSSRContextAsync(context, async () => {
      assert.equal(getRequestEvent(), null);
    });
    const rendered = await renderToStringAsync(() => String(getRequestEvent()?.id || "missing"));
    assert.equal(rendered, "stale");
    assert.equal(getRequestEvent(), null);
  });

  it("sanitizes URL and inline style interpolations during SSR", () => {
    const output = String(renderToString(() => html`<a href=${"javascript:alert(1)"} style=${"background:url(javascript:alert(1))"}>x</a>`));
    assert.match(output, /href=""/);
    assert.match(output, /style=""/);
    assert.doesNotMatch(output, /javascript:/i);
  });

  it("allowlists and sanitizes SSR head link attributes", () => {
    const output = renderToString(() => {
      useHead({
        links: [{
          rel: "preload",
          href: "javascript:alert(1)",
          onload: "alert(2)",
          imagesrcset: "https://safe.example/a.png 1x, data:image/svg+xml,<svg> 2x"
        }]
      });
      return "page";
    });

    assert.equal(output, "page");
    assert.doesNotMatch(getSSRHead(), /javascript:|onload|imagesrcset/i);
  });

  it("does not lose immediately-resolved resources in streaming SSR", async () => {
    const stream = renderToStream(() => {
      const [data] = createResource(async () => "ready");
      return html`<p>${data}</p>`;
    });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let output = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += decoder.decode(chunk.value);
    }
    assert.match(output, /<p>ready<\/p>/);
  });

  it("publishes final async head metadata before the streamed body", async () => {
    const stream = renderToStream(() => {
      const [data] = createResource(async () => "ready");
      useHead({ title: () => `Page ${data() || "loading"}` });
      return html`<p>${data}</p>`;
    });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let output = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += decoder.decode(chunk.value);
    }

    assert.match(output, /<title>Page ready<\/title>/);
    assert.ok(output.indexOf("<title>Page ready</title>") < output.indexOf("<\/head>"));
    assert.ok(output.indexOf("<\/head>") < output.indexOf("<body>"));
  });

  it("emits a stream shell before resources settle and aborts on cancel", async () => {
    let aborted = false;
    const stream = renderToStream(() => {
      const [data] = createResource(({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }));
      return html`<p>${data}</p>`;
    });
    const reader = stream.getReader();
    const first = await reader.read();
    assert.equal(first.done, false);
    assert.match(new TextDecoder().decode(first.value), /<!DOCTYPE html>/);
    await reader.cancel();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(aborted, true);
  });
});
