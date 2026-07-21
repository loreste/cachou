import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  signal,
  effect,
  createRoot,
  untrack,
  getOwner,
  runWithOwner,
  onCleanup,
  splitProps,
  mergeProps,
  For,
  Index,
  matchPath,
  configureRouter,
  getHistoryMode,
  back,
  forward,
  beforeNavigate,
  navigate,
  Route,
  redirect,
  notFound,
  isRedirectError,
  isNotFoundError,
  createAction,
  createMutation,
  setQueryData,
  getQueryData,
  optimisticUpdate,
  createForm,
  Layout
} from "../../src/index.js";
import { stripTypeScript as stripTS } from "../../packages/compiler/lib/compile.mjs";
import { applyNavigation, currentPath, currentSearch } from "../../src/router-state.js";

describe("untrack / owner", () => {
  it("untrack avoids subscriptions", () => {
    const [n, setN] = signal(0);
    let runs = 0;
    createRoot(dispose => {
      effect(() => {
        untrack(() => n());
        runs++;
      });
      assert.equal(runs, 1);
      setN(1);
      assert.equal(runs, 1);
      dispose();
    });
  });

  it("getOwner and runWithOwner attach cleanups", () => {
    let cleaned = false;
    createRoot(dispose => {
      const owner = getOwner();
      assert.ok(owner);
      runWithOwner(owner, () => {
        onCleanup(() => {
          cleaned = true;
        });
      });
      dispose();
    });
    assert.equal(cleaned, true);
  });
});

describe("splitProps / mergeProps", () => {
  it("splits and merges", () => {
    const props = { a: 1, b: 2, c: 3 };
    const [picked, rest] = splitProps(props, ["a", "b"]);
    assert.equal(picked.a, 1);
    assert.equal(picked.b, 2);
    assert.equal(rest.c, 3);
    const merged = mergeProps({ a: 1 }, { a: 2, b: 3 });
    assert.equal(merged.a, 2);
    assert.equal(merged.b, 3);
  });
});

describe("For / Index", () => {
  it("maps keyed list", () => {
    const [items, setItems] = signal([
      { id: 1, t: "a" },
      { id: 2, t: "b" }
    ]);
    const view = For({
      each: items,
      by: i => i.id,
      children: item => item.t
    });
    assert.deepEqual(view(), ["a", "b"]);
    setItems([
      { id: 2, t: "b" },
      { id: 1, t: "a" }
    ]);
    assert.deepEqual(view(), ["b", "a"]);
  });

  it("Index passes accessors", () => {
    const [items] = signal(["x", "y"]);
    const view = Index({
      each: items,
      children: (item, i) => `${i}:${item()}`
    });
    assert.deepEqual(view(), ["0:x", "1:y"]);
  });
});

describe("matchPath", () => {
  it("matches optional and rest params", () => {
    assert.equal(matchPath("/blog/:slug?", "/blog").matches, true);
    assert.equal(matchPath("/blog/:slug?", "/blog/hi").params.slug, "hi");
    const rest = matchPath("/docs/:path*", "/docs/a/b");
    assert.equal(rest.matches, true);
    assert.equal(rest.params.path, "a/b");
    assert.equal(matchPath("/files/*", "/files/x/y").matches, true);
    assert.equal(matchPath("/users/:id", "/users/1").params.id, "1");
  });

  it("backtracks optional segments before a following literal", () => {
    const omitted = matchPath("/docs/:lang?/guide", "/docs/guide");
    assert.equal(omitted.matches, true);
    assert.deepEqual(omitted.params, {});
    const present = matchPath("/docs/:lang?/guide", "/docs/en/guide");
    assert.equal(present.matches, true);
    assert.equal(present.params.lang, "en");
  });
});

describe("route loader cancellation", () => {
  it("keeps only the newest loader result and disposes the resource owner", async () => {
    configureRouter({ history: "memory", initialPath: "/users/0" });
    const started = [];
    const aborted = [];
    const rendered = [];
    let View;
    let dispose;

    createRoot(rootDispose => {
      dispose = rootDispose;
      View = Route({
        path: "/users/:id",
        load: ({ params, signal }) => new Promise(resolve => {
          const id = params.id;
          started.push(id);
          signal?.addEventListener("abort", () => aborted.push(id), { once: true });
          setTimeout(() => resolve({ id }), id === "0" ? 30 : 1);
        }),
        component: (_params, state) => `user:${state.data()?.id || "pending"}`
      });
      effect(() => {
        rendered.push(View());
      });
    });

    navigate("/users/1", { scroll: false, focus: false });
    navigate("/users/2", { scroll: false, focus: false });
    await new Promise(resolve => setTimeout(resolve, 45));

    assert.deepEqual(started, ["0", "1", "2"]);
    assert.deepEqual(aborted.sort(), ["0", "1"]);
    assert.equal(rendered.at(-1), "user:2");

    const requestCount = started.length;
    dispose();
    navigate("/users/3", { scroll: false, focus: false });
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(started.length, requestCount, "disposed routes do not restart loaders");
  });
});

describe("history memory mode", () => {
  it("configureRouter memory", () => {
    configureRouter({ history: "memory", initialPath: "/shop?q=1" });
    assert.equal(getHistoryMode(), "memory");
    assert.equal(currentPath(), "/shop");
    assert.equal(currentSearch(), "?q=1");
    applyNavigation("/cart");
    assert.equal(currentPath(), "/cart");
    applyNavigation("/checkout");
    assert.equal(back(), true);
    assert.equal(currentPath(), "/cart");
    assert.equal(forward(), true);
    assert.equal(currentPath(), "/checkout");
    assert.equal(back(), true);
    applyNavigation("/new");
    assert.equal(forward(), false, "A new memory navigation removes stale forward history");
    assert.equal(currentPath(), "/new");
  });

  it("cancels stale async navigation guards", async () => {
    configureRouter({ history: "memory", initialPath: "/" });
    const off = beforeNavigate(({ to, signal }) => new Promise(resolve => {
      setTimeout(() => resolve(to !== "/blocked" && !signal.aborted), 15);
    }));
    try {
      assert.equal(navigate("/blocked", { scroll: false, focus: false }), true);
      assert.equal(navigate("/current", { scroll: false, focus: false }), true);
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(currentPath(), "/current");
    } finally {
      off();
    }
  });

  it("commits only the final route during a rapid navigation burst", async () => {
    configureRouter({ history: "memory", initialPath: "/" });
    const observed = [];
    const burstCount = 256;
    let resolveObserved;
    let timeoutId;
    const observedComplete = new Promise((resolve, reject) => {
      resolveObserved = resolve;
      timeoutId = setTimeout(() => reject(new Error("navigation burst did not settle")), 1000);
    });
    const off = beforeNavigate(({ to, signal }) => new Promise(resolve => {
      setTimeout(() => {
        observed.push({ to, aborted: signal.aborted });
        if (observed.length === burstCount) resolveObserved();
        resolve(!signal.aborted);
      }, 1);
    }));
    try {
      const lastPath = "/item/255";
      for (let index = 0; index < burstCount; index++) {
        navigate(`/item/${index}`, { scroll: false, focus: false });
      }
      await observedComplete;
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(currentPath(), lastPath);
      assert.ok(observed.slice(0, -1).every(entry => entry.aborted));
      assert.deepEqual(observed.at(-1), { to: lastPath, aborted: false });
    } finally {
      clearTimeout(timeoutId);
      off();
    }
  });
});

describe("redirect / notFound", () => {
  it("throws typed errors", () => {
    try {
      redirect("/login");
      assert.fail("expected throw");
    } catch (e) {
      assert.equal(isRedirectError(e), true);
      assert.equal(e.path, "/login");
    }
    try {
      notFound();
      assert.fail("expected throw");
    } catch (e) {
      assert.equal(isNotFoundError(e), true);
    }
  });
});

describe("createAction", () => {
  it("submits and stores result", async () => {
    const action = createAction(async data => {
      return { ok: true, data };
    });
    const res = await action.submit({ a: 1 });
    assert.equal(res.ok, true);
    assert.equal(action.result().ok, true);
    assert.equal(action.pending(), false);
  });

  it("guards overlapping submits so a slower first call cannot clobber state", async () => {
    let resolveSlow;
    const slow = new Promise(r => {
      resolveSlow = r;
    });
    let step = 0;
    const action = createAction(async data => {
      const n = ++step;
      if (data === "slow") {
        await slow;
        return { n, tag: "slow" };
      }
      return { n, tag: "fast" };
    });

    const p1 = action.submit("slow");
    assert.equal(action.pending(), true);
    const p2 = action.submit("fast");
    const fast = await p2;
    assert.equal(fast.tag, "fast");
    assert.equal(action.result().tag, "fast", "latest submit wins result");
    assert.equal(action.pending(), false, "pending clears when latest submit settles");
    assert.equal(action.error(), null);

    resolveSlow();
    const slowRes = await p1;
    assert.equal(slowRes.tag, "slow", "stale submit still resolves for the caller");
    assert.equal(action.result().tag, "fast", "stale success does not overwrite newer result");
    assert.equal(action.pending(), false);
  });

  it("ignores stale submit errors after a newer success", async () => {
    let rejectSlow;
    const slow = new Promise((_, rej) => {
      rejectSlow = rej;
    });
    const action = createAction(async data => {
      if (data === "slow") {
        await slow;
        return { tag: "slow" };
      }
      return { tag: "fast" };
    });

    const p1 = action.submit("slow");
    await action.submit("fast");
    assert.equal(action.result().tag, "fast");

    rejectSlow(new Error("stale-fail"));
    await assert.rejects(() => p1, /stale-fail/);
    assert.equal(action.error(), null, "stale error must not set error signal");
    assert.equal(action.result().tag, "fast");
    assert.equal(action.pending(), false);
  });
});

describe("Layout routeData prop", () => {
  it("passes child load state on the layout component props", async () => {
    configureRouter({ history: "memory", initialPath: "/app/hi" });
    let seenRouteData = null;
    let layoutText = "";
    let dispose;

    function unwrapView(value, depth = 0) {
      if (depth > 16) return value;
      if (typeof value === "function" && !value.$$cachouSignal && !value.$$cachouMatch) {
        return unwrapView(value(), depth + 1);
      }
      return value;
    }

    createRoot(rootDispose => {
      dispose = rootDispose;
      const child = Route({
        path: "/app/:slug",
        load: ({ params }) => ({ title: params.slug }),
        component: (params, state) => `page:${state.data()?.title || "…"}`
      });
      // Route() returns a render function with $$cachouRoute metadata.
      const layout = Layout({
        path: "/app",
        component: props => {
          seenRouteData = props.routeData;
          return `layout:${props.routeData ? "has-state" : "none"}`;
        },
        children: [child]
      });
      layoutText = String(unwrapView(layout));
    });

    assert.match(layoutText, /layout:has-state/, "Layout component rendered with routeData object");
    assert.ok(seenRouteData, "Layout receives routeData for the matched child");
    assert.equal(typeof seenRouteData.data, "function");
    assert.equal(typeof seenRouteData.loading, "function");

    // Resource load is async; wait for data to settle.
    await new Promise(r => setTimeout(r, 30));
    assert.equal(seenRouteData.data()?.title, "hi");
    dispose?.();
  });
});

describe("createMutation optimistic", () => {
  it("rolls back on error", async () => {
    setQueryData("cart", { n: 0 });
    const m = createMutation(
      async () => {
        throw new Error("fail");
      },
      {
        onMutate() {
          const snap = optimisticUpdate("cart", c => ({ n: (c?.n || 0) + 1 }));
          assert.equal(getQueryData("cart").n, 1);
          return { rollback: snap.rollback };
        }
      }
    );
    await assert.rejects(() => m.mutate());
    assert.equal(getQueryData("cart").n, 0);
  });

  it("commits on success", async () => {
    setQueryData("cart2", { n: 0 });
    const m = createMutation(async () => ({ n: 5 }), {
      onMutate() {
        return optimisticUpdate("cart2", { n: 1 });
      },
      onSuccess(data) {
        setQueryData("cart2", data);
      }
    });
    await m.mutate();
    assert.equal(getQueryData("cart2").n, 5);
  });
});

describe("createMutation abort edges", () => {
  it("passes a real AbortSignal to mutationFn", async () => {
    let seenSignal = null;
    const m = createMutation(async (_input, ctx) => {
      seenSignal = ctx.signal;
      return "ok";
    });
    await m.mutate({ x: 1 });
    assert.ok(seenSignal, "signal is provided");
    assert.equal(typeof seenSignal.aborted, "boolean");
    assert.equal(seenSignal.aborted, false);
  });

  it("aborts the previous in-flight mutate when a newer one starts", async () => {
    const aborted = [];
    let resolveFirst;
    let resolveSecond;
    let calls = 0;
    const m = createMutation(async (input, { signal }) => {
      const id = ++calls;
      signal.addEventListener(
        "abort",
        () => {
          aborted.push(id);
        },
        { once: true }
      );
      await new Promise(resolve => {
        if (id === 1) resolveFirst = resolve;
        else resolveSecond = resolve;
      });
      if (signal.aborted) {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return input;
    });

    const first = m.mutate("a");
    const second = m.mutate("b");
    // Let the second mutate start and abort the first
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(aborted, [1]);

    resolveFirst("stale");
    resolveSecond("fresh");
    await assert.rejects(() => first, err => err && err.name === "AbortError");
    assert.equal(await second, "b");
    assert.equal(m.data(), "b");
    assert.equal(m.pending(), false);
    assert.equal(m.error(), null);
  });

  it("reset aborts in-flight work and clears state", async () => {
    let aborted = false;
    let resolveMut;
    const m = createMutation(async (_input, { signal }) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted = true;
        },
        { once: true }
      );
      await new Promise(resolve => {
        resolveMut = resolve;
      });
      if (signal.aborted) {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      return "done";
    });

    const p = m.mutate();
    assert.equal(m.pending(), true);
    m.reset();
    assert.equal(m.pending(), false);
    assert.equal(m.data(), undefined);
    assert.equal(m.error(), null);
    resolveMut();
    await assert.rejects(() => p, err => err && err.name === "AbortError");
    assert.equal(aborted, true);
  });

  it("dispose freezes further mutates and aborts in-flight", async () => {
    let aborted = false;
    let resolveMut;
    const m = createMutation(async (_input, { signal }) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted = true;
        },
        { once: true }
      );
      await new Promise(resolve => {
        resolveMut = resolve;
      });
      return "done";
    });

    const p = m.mutate();
    m.dispose();
    m.dispose(); // idempotent
    assert.equal(aborted, true);
    resolveMut();
    await assert.rejects(() => p, err => err && err.name === "AbortError");
    await assert.rejects(() => m.mutate("x"), err => err && err.name === "AbortError");
  });

  it("external mutate signal aborts and rolls back optimistic state", async () => {
    setQueryData("mut-opt", { n: 0 });
    let resolveMut;
    const ac = new AbortController();
    const m = createMutation(
      async (_input, { signal }) => {
        await new Promise((resolve, reject) => {
          resolveMut = resolve;
          signal.addEventListener(
            "abort",
            () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            },
            { once: true }
          );
        });
        return { n: 99 };
      },
      {
        onMutate() {
          return optimisticUpdate("mut-opt", { n: 1 });
        }
      }
    );

    const p = m.mutate(undefined, { signal: ac.signal });
    assert.equal(getQueryData("mut-opt").n, 1);
    ac.abort();
    await assert.rejects(() => p, err => err && err.name === "AbortError");
    assert.equal(getQueryData("mut-opt").n, 0, "optimistic update rolled back on abort");
    assert.equal(m.error(), null, "abort is not a mutation error");
    assert.equal(m.pending(), false);
    resolveMut?.();
  });

  it("does not call onSuccess for superseded mutations", async () => {
    const successes = [];
    let resolveFirst;
    let resolveSecond;
    let calls = 0;
    const m = createMutation(
      async (input) => {
        const id = ++calls;
        await new Promise(resolve => {
          if (id === 1) resolveFirst = resolve;
          else resolveSecond = resolve;
        });
        return input;
      },
      {
        onSuccess(data) {
          successes.push(data);
        }
      }
    );

    const first = m.mutate("old");
    const second = m.mutate("new");
    await new Promise(r => setTimeout(r, 5));
    resolveFirst();
    resolveSecond();
    await assert.rejects(() => first, err => err && err.name === "AbortError");
    assert.equal(await second, "new");
    assert.deepEqual(successes, ["new"]);
  });
});

describe("nested createForm", () => {
  it("uses path fields", () => {
    const form = createForm({ address: { city: "Paris" }, tags: ["a"] }, { nested: true });
    assert.equal(form.field("address.city").value(), "Paris");
    form.field("address.city").setValue("Lyon");
    assert.equal(form.values().address.city, "Lyon");
  });

  it("reset(nextValues) applies nested paths", () => {
    const form = createForm(
      { user: { name: "Ada", age: 30 }, title: "x" },
      { nested: true }
    );
    form.field("user.name").setValue("Grace");
    form.field("user.age").setValue(99);
    form.field("title").setValue("y");
    form.reset({ user: { name: "Bob", age: 1 }, title: "z" });
    assert.equal(form.field("user.name").value(), "Bob");
    assert.equal(form.field("user.age").value(), 1);
    assert.equal(form.field("title").value(), "z");
    assert.deepEqual(form.values(), { user: { name: "Bob", age: 1 }, title: "z" });
  });

  it("reset() without args restores nested initials", () => {
    const form = createForm({ user: { name: "Ada" } }, { nested: true });
    form.field("user.name").setValue("Grace");
    form.reset();
    assert.equal(form.field("user.name").value(), "Ada");
  });

  it("reset(nextValues) keeps field initial when nested path is omitted", () => {
    const form = createForm(
      { user: { name: "Ada", age: 30 } },
      { nested: true }
    );
    form.field("user.name").setValue("Grace");
    form.field("user.age").setValue(99);
    form.reset({ user: { name: "Bob" } }); // age omitted
    assert.equal(form.field("user.name").value(), "Bob");
    assert.equal(form.field("user.age").value(), 30);
  });
});

describe("createField validation", () => {
  it("only treats non-empty strings as errors", async () => {
    const { createField } = await import("../../src/forms.js");
    for (const ret of [null, undefined, "", 0, false]) {
      const field = createField("x", { validate: () => ret });
      assert.equal(await field.validate(), true);
      assert.equal(field.error(), null);
    }
    const bad = createField("x", { validate: () => "nope" });
    assert.equal(await bad.validate(), false);
    assert.equal(bad.error(), "nope");
  });

  it("dirty uses reset baseline, not the original initial value", async () => {
    const { createField } = await import("../../src/forms.js");
    const field = createField("a");
    assert.equal(field.dirty(), false);
    field.setValue("b");
    assert.equal(field.dirty(), true);
    field.reset("b");
    assert.equal(field.value(), "b");
    assert.equal(field.dirty(), false, "reset(x) marks the field clean against x");
    field.setValue("c");
    assert.equal(field.dirty(), true);
    field.reset();
    assert.equal(field.value(), "a", "reset() restores the original initial value");
    assert.equal(field.dirty(), false);
  });

  it("stale async validate does not report false when state is valid", async () => {
    const { createField } = await import("../../src/forms.js");
    let resolveSlow;
    const slow = new Promise(r => {
      resolveSlow = r;
    });
    const field = createField("", {
      validate: async v => {
        if (v === "slow") {
          await slow;
          return "slow-err";
        }
        return undefined;
      }
    });
    field.setValue("slow");
    const p1 = field.validate();
    field.setValue("ok");
    const p2 = field.validate();
    assert.equal(await p2, true);
    resolveSlow();
    assert.equal(await p1, true); // stale run reports current validity
    assert.equal(field.error(), null);
  });
});

describe("createForm form-level validate", () => {
  it("treats empty error object as success", async () => {
    const { createForm } = await import("../../src/forms.js");
    const form = createForm({ name: "Ada" }, {
      validate: () => ({})
    });
    assert.equal(await form.validate(), true, "validate: () => ({}) succeeds");
    assert.equal(form.fields.name.error(), null);
  });

  it("applies only non-empty string form errors", async () => {
    const { createForm } = await import("../../src/forms.js");
    const form = createForm({ a: "1", b: "2" }, {
      validate: () => ({ a: "bad", b: "", c: "orphan" })
    });
    assert.equal(await form.validate(), false);
    assert.equal(form.fields.a.error(), "bad");
    assert.equal(form.fields.b.error(), null, "empty string form errors are ignored");
  });
});

describe("compiler stripTypeScript", () => {
  it("strips simple annotations", () => {
    const src = `
      const x: number = 1;
      function f(a: string): number { return 1; }
      const y = z as Foo;
    `;
    const out = stripTS(src);
    assert.match(out, /const x = 1/);
    assert.match(out, /function f\(a\)/);
    assert.doesNotMatch(out, /\sas\s/);
  });
});
