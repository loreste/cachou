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
  redirect,
  notFound,
  isRedirectError,
  isNotFoundError,
  createAction,
  createMutation,
  setQueryData,
  getQueryData,
  optimisticUpdate,
  createForm
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
});

describe("history memory mode", () => {
  it("configureRouter memory", () => {
    configureRouter({ history: "memory", initialPath: "/shop?q=1" });
    assert.equal(getHistoryMode(), "memory");
    assert.equal(currentPath(), "/shop");
    assert.equal(currentSearch(), "?q=1");
    applyNavigation("/cart");
    assert.equal(currentPath(), "/cart");
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

describe("nested createForm", () => {
  it("uses path fields", () => {
    const form = createForm({ address: { city: "Paris" }, tags: ["a"] }, { nested: true });
    assert.equal(form.field("address.city").value(), "Paris");
    form.field("address.city").setValue("Lyon");
    assert.equal(form.values().address.city, "Lyon");
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
