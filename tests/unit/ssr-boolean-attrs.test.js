import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("SSR boolean / false attribute omission", () => {
  let html;
  let renderToString;
  let prevMock;

  before(async () => {
    prevMock = globalThis.__MOCK_SSR__;
    globalThis.__MOCK_SSR__ = true;
    ({ html, renderToString } = await import("../../src/html.js"));
  });

  after(() => {
    globalThis.__MOCK_SSR__ = prevMock;
  });

  it("omits disabled/checked/hidden when false", () => {
    const out = String(renderToString(() => html`
      <button disabled=${false}>Go</button>
      <input type="checkbox" checked=${false} />
      <div hidden=${false}>x</div>
    `));
    assert.equal(out.includes("disabled"), false, "disabled=false must not emit attribute");
    assert.equal(out.includes("checked"), false, "checked=false must not emit attribute");
    assert.equal(out.includes("hidden"), false, "hidden=false must not emit attribute");
    assert.match(out, /<button[^>]*>Go<\/button>/);
  });

  it("omits quoted false attributes without leaving stray quotes", () => {
    const out = String(renderToString(() => html`<button disabled="${false}" class="ok">Go</button>`));
    assert.equal(out.includes("disabled"), false);
    assert.match(out, /class="ok"/);
    assert.equal(out.includes('""'), false, "no empty quote residue");
  });

  it("emits boolean attributes when true", () => {
    const out = String(renderToString(() => html`<button disabled=${true}>Go</button>`));
    assert.match(out, /disabled=/);
  });

  it("omits null and undefined attribute values", () => {
    const out = String(renderToString(() => html`
      <input value=${null} name=${undefined} data-x=${false} />
    `));
    assert.equal(out.includes("value="), false);
    assert.equal(out.includes("name="), false);
    assert.equal(out.includes("data-x"), false);
  });

  it("keeps true-ish string attribute values", () => {
    const out = String(renderToString(() => html`<div title=${"hello"} id=${"x"}>t</div>`));
    assert.match(out, /title="hello"/);
    assert.match(out, /id="x"/);
  });
});
