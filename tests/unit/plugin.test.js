import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { launch, getApp, createApp, useApp } from "../../src/plugin.js";

describe("launch", () => {
  it("creates app with plug, provide, component, directive, mount, unmount", () => {
    const app = launch(() => null);
    assert.equal(typeof app.plug, "function");
    assert.equal(typeof app.provide, "function");
    assert.equal(typeof app.component, "function");
    assert.equal(typeof app.directive, "function");
    assert.equal(typeof app.unmount, "function");
    assert.equal(app.isMounted, false);
  });

  it("plugin install via function", () => {
    let installed = false;
    const app = launch(() => null);
    app.plug((a) => {
      installed = true;
      assert.equal(a, app);
    });
    assert.ok(installed);
  });

  it("plugin install via object with install()", () => {
    let installed = false;
    const plugin = {
      install(a, opt1, opt2) {
        installed = true;
        assert.equal(a.config !== undefined, true);
        assert.equal(opt1, "option1");
        assert.equal(opt2, "option2");
      }
    };
    const app = launch(() => null);
    app.plug(plugin, "option1", "option2");
    assert.ok(installed);
  });

  it("deduplicates plugin installation", () => {
    let count = 0;
    const plugin = (app) => { count++; };
    const app = launch(() => null);
    app.plug(plugin);
    app.plug(plugin);
    app.plug(plugin);
    assert.equal(count, 1);
  });

  it("chaining works on plug()", () => {
    const app = launch(() => null);
    const result = app.plug(() => {});
    assert.equal(result, app);
  });

  it("chaining works on provide()", () => {
    const app = launch(() => null);
    const result = app.provide("key", "value");
    assert.equal(result, app);
  });

  it("component registration and lookup", () => {
    const app = launch(() => null);
    const MyComponent = () => null;
    app.component("MyComponent", MyComponent);
    assert.equal(app.component("MyComponent"), MyComponent);
  });

  it("component lookup returns undefined for unregistered", () => {
    const app = launch(() => null);
    assert.equal(app.component("Nope"), undefined);
  });

  it("directive registration and lookup", () => {
    const app = launch(() => null);
    const myDirective = () => {};
    app.directive("focus", myDirective);
    assert.equal(app.directive("focus"), myDirective);
  });

  it("config object has expected shape", () => {
    const app = launch(() => null);
    assert.equal(app.config.errorHandler, null);
    assert.equal(app.config.warnHandler, null);
    assert.ok(typeof app.config.globalProperties === "object");
  });

  it("config.errorHandler can be set", () => {
    const handler = () => {};
    const app = launch(() => null);
    app.config.errorHandler = handler;
    assert.equal(app.config.errorHandler, handler);
  });

  it("unmount before mount is a no-op", () => {
    const app = launch(() => null);
    app.unmount(); // should not throw
    assert.equal(app.isMounted, false);
  });

  it("invalid plugin warns but doesn't crash", () => {
    const app = launch(() => null);
    // passing an object without install
    app.plug({ notInstall: true });
    // should not throw
  });

  it("provides are stored", () => {
    const app = launch(() => null);
    app.provide("db", { query: () => {} });
    app.provide("auth", { user: null });
    assert.equal(app._provides.size, 2);
  });

  it("multiple plugins can register components", () => {
    const app = launch(() => null);
    app.plug((a) => a.component("A", () => "a"));
    app.plug((a) => a.component("B", () => "b"));
    assert.equal(typeof app.component("A"), "function");
    assert.equal(typeof app.component("B"), "function");
  });
});

describe("useApp", () => {
  it("returns null outside app context", () => {
    // In Node without mounting, useApp should return the default (null)
    const result = useApp();
    assert.equal(result, null);
  });
});
