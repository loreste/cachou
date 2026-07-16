import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { signal, effect, createRoot } from "../../src/reactivity.js";
import { persist } from "../../src/persist.js";

// Minimal Storage mock
function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    _store: store
  };
}

describe("persist", () => {
  it("requires options.key", () => {
    const [get, set] = signal(0);
    assert.throws(() => persist([get, set], {}), /requires options.key/);
  });

  it("loads initial value from storage", () => {
    const storage = createMockStorage({ myKey: JSON.stringify(42) });
    const [get, set] = signal(0);
    createRoot(dispose => {
      persist([get, set], { key: "myKey", storage, sync: false });
      assert.equal(get(), 42);
      dispose();
    });
  });

  it("writes signal changes to storage", () => {
    const storage = createMockStorage();
    const [get, set] = signal("hello");
    createRoot(dispose => {
      persist([get, set], { key: "test", storage, sync: false });
      set("world");
      assert.equal(storage._store.test, JSON.stringify("world"));
      dispose();
    });
  });

  it("handles corrupt JSON in storage gracefully", () => {
    const storage = createMockStorage({ bad: "not valid json {{" });
    const [get, set] = signal("default");
    // Should warn but not crash
    createRoot(dispose => {
      persist([get, set], { key: "bad", storage, sync: false });
      // Value stays at default because deserialization failed
      assert.equal(get(), "default");
      dispose();
    });
  });

  it("handles storage.getItem throwing", () => {
    const storage = {
      getItem() { throw new Error("quota exceeded"); },
      setItem() {},
      removeItem() {}
    };
    const [get, set] = signal("fallback");
    createRoot(dispose => {
      persist([get, set], { key: "err", storage, sync: false });
      assert.equal(get(), "fallback");
      dispose();
    });
  });

  it("handles storage.setItem throwing", () => {
    const storage = {
      getItem() { return null; },
      setItem() { throw new Error("quota exceeded"); },
      removeItem() {}
    };
    const [get, set] = signal(0);
    createRoot(dispose => {
      persist([get, set], { key: "err", storage, sync: false });
      // Should not crash
      set(1);
      assert.equal(get(), 1);
      dispose();
    });
  });

  it("custom serialize/deserialize", () => {
    const storage = createMockStorage();
    const [get, set] = signal(new Date("2024-01-01"));
    createRoot(dispose => {
      persist([get, set], {
        key: "date",
        storage,
        sync: false,
        serialize: v => v.toISOString(),
        deserialize: s => new Date(s)
      });
      assert.equal(storage._store.date, new Date("2024-01-01").toISOString());
      dispose();
    });
  });

  it("dispose stops persisting", () => {
    const storage = createMockStorage();
    const [get, set] = signal(0);
    createRoot(dispose => {
      const stop = persist([get, set], { key: "stop", storage, sync: false });
      set(1);
      assert.equal(storage._store.stop, "1");
      stop();
      set(2);
      // After stop, storage should still have old value
      assert.equal(storage._store.stop, "1");
      dispose();
    });
  });

  it("null storage is handled gracefully", () => {
    const [get, set] = signal(0);
    createRoot(dispose => {
      // Explicitly pass null storage — should not crash
      persist([get, set], { key: "null", storage: null, sync: false });
      set(5);
      assert.equal(get(), 5);
      dispose();
    });
  });

  it("handles undefined value in storage", () => {
    const storage = createMockStorage({ undef: JSON.stringify(undefined) });
    const [get, set] = signal("default");
    createRoot(dispose => {
      persist([get, set], { key: "undef", storage, sync: false });
      dispose();
    });
  });

  it("handles nested objects", () => {
    const storage = createMockStorage();
    const [get, set] = signal({ a: 1, b: { c: 2 } });
    createRoot(dispose => {
      persist([get, set], { key: "obj", storage, sync: false });
      assert.deepEqual(JSON.parse(storage._store.obj), { a: 1, b: { c: 2 } });
      set({ a: 3, b: { c: 4 } });
      assert.deepEqual(JSON.parse(storage._store.obj), { a: 3, b: { c: 4 } });
      dispose();
    });
  });
});
