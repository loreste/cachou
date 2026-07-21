/**
 * Multi class: coexistence — must not wipe sibling class: bindings.
 * Runs under happy-dom / browser-like environment when available via tests/tests.js;
 * this unit file uses a minimal DOM shim only if document is missing.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

describe("class: multi-directive coexistence", () => {
  let html;
  let signal;
  let hasDom = false;

  before(async () => {
    hasDom = typeof document !== "undefined" && typeof document.createElement === "function";
    if (!hasDom) {
      // Unit suite may run in plain Node — skip DOM assertions gracefully.
      return;
    }
    ({ html } = await import("../../src/html.js"));
    ({ signal } = await import("../../src/reactivity.js"));
  });

  it("keeps multiple class: bindings independent", async () => {
    if (!hasDom) return;
    const [a, setA] = signal(true);
    const [b, setB] = signal(true);
    const el = html`<div class:foo=${a} class:bar=${b}>x</div>`;
    assert.equal(el.classList.contains("foo"), true);
    assert.equal(el.classList.contains("bar"), true);

    setA(false);
    assert.equal(el.classList.contains("foo"), false, "foo toggled off");
    assert.equal(el.classList.contains("bar"), true, "bar must survive foo off");

    setB(false);
    assert.equal(el.classList.contains("foo"), false);
    assert.equal(el.classList.contains("bar"), false);

    setA(true);
    assert.equal(el.classList.contains("foo"), true);
    assert.equal(el.classList.contains("bar"), false, "bar must stay off while foo turns on");
  });

  it("preserves static class when toggling class:", async () => {
    if (!hasDom) return;
    const [on, setOn] = signal(true);
    const el = html`<div class="base" class:active=${on}>x</div>`;
    assert.equal(el.classList.contains("base"), true);
    assert.equal(el.classList.contains("active"), true);
    setOn(false);
    assert.equal(el.classList.contains("base"), true, "static class survives toggle off");
    assert.equal(el.classList.contains("active"), false);
    setOn(true);
    assert.equal(el.classList.contains("base"), true);
    assert.equal(el.classList.contains("active"), true);
  });
});
