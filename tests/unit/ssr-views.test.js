import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  html,
  renderToString,
  renderToStringAsync,
  renderToStream,
  createSSRContext,
  createResource,
  Show,
  Switch,
  Match,
  For,
  signal,
  createI18n
} from "../../src/index.js";

describe("SSR view unwrapping (Show/For/Switch)", () => {
  it("renderToString evaluates Show returned as the root view", () => {
    const out = renderToString(() =>
      Show({
        when: true,
        children: () => html`<p>yes</p>`,
        fallback: () => html`<p>no</p>`
      })
    );
    assert.match(out, /<p>yes<\/p>/);
    assert.doesNotMatch(out, /no/);
    assert.doesNotMatch(out, /function/);
  });

  it("renderToString evaluates nested Show fallback", () => {
    const out = renderToString(() =>
      Show({
        when: false,
        children: () => html`<p>yes</p>`,
        fallback: () => html`<p>fallback</p>`
      })
    );
    assert.match(out, /fallback/);
  });

  it("renderToString evaluates For lists", () => {
    const out = renderToString(() =>
      For({
        each: [{ id: 1, t: "a" }, { id: 2, t: "b" }],
        by: i => i.id,
        children: item => html`<li>${item.t}</li>`
      })
    );
    assert.match(out, /<li>a<\/li>/);
    assert.match(out, /<li>b<\/li>/);
  });

  it("renderToString evaluates Switch/Match", () => {
    const out = renderToString(() =>
      Switch({
        children: [
          Match({ when: false, children: () => html`<p>a</p>` }),
          Match({ when: true, children: () => html`<p>b</p>` })
        ]
      })
    );
    assert.match(out, /<p>b<\/p>/);
    assert.doesNotMatch(out, /<p>a<\/p>/);
  });

  it("renderToStringAsync + resources with Show wrapper", async () => {
    const out = await renderToStringAsync(() => {
      const [data] = createResource(async () => {
        await new Promise(r => setTimeout(r, 5));
        return "loaded";
      }, { revalidateOnFocus: false, revalidateOnReconnect: false });
      return Show({
        when: () => data(),
        children: v => html`<strong>${v}</strong>`,
        fallback: () => html`<em>wait</em>`
      });
    });
    assert.match(out, /<strong>loaded<\/strong>/);
  });

  it("renderToStream serializes Show/html views (not function source)", async () => {
    const ctx = createSSRContext();
    const stream = renderToStream(
      () => {
        const [data] = createResource(async () => {
          await new Promise(r => setTimeout(r, 10));
          return "streamed";
        }, { revalidateOnFocus: false, revalidateOnReconnect: false });
        return () => html`<span>${() => data() || "…"}</span>`;
      },
      { context: ctx }
    );
    let full = "";
    const reader = stream.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += dec.decode(value);
    }
    assert.match(full, /streamed/);
    assert.doesNotMatch(full, /=> html/);
    assert.match(full, /__CACHOU_STATE__/);
  });

  it("renderToStream progressive mode paints shell before final body swap", async () => {
    const ctx = createSSRContext();
    const stream = renderToStream(
      () => {
        const [data] = createResource(async () => {
          await new Promise(r => setTimeout(r, 15));
          return "final-value";
        }, { revalidateOnFocus: false, revalidateOnReconnect: false });
        return html`<p>${() => data() || "loading-shell"}</p>`;
      },
      { context: ctx, progressive: true, nonce: "n0" }
    );
    const chunks = [];
    const reader = stream.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(dec.decode(value));
    }
    const full = chunks.join("");
    // First-paint content and final swap both present in stream
    assert.match(full, /loading-shell|final-value/);
    assert.match(full, /innerHTML=/);
    assert.match(full, /final-value/);
    assert.match(full, /nonce="n0"/);
    assert.ok(chunks.length >= 2, "progressive stream yields multiple chunks");
  });
});

describe("createI18n locale alias", () => {
  it("accepts locale as alias for defaultLocale", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { hi: "Hello {name}" } }
    });
    assert.equal(i18n.t("hi", { name: "Ada" }), "Hello Ada");
  });

  it("throws when neither defaultLocale nor locale is set", () => {
    assert.throws(() => createI18n({ messages: {} }), /defaultLocale/);
  });
});

describe("reactive Show when signal flips (SSR snapshot)", () => {
  it("captures current when value", () => {
    const [on, setOn] = signal(true);
    const out1 = renderToString(() =>
      Show({ when: on, children: () => html`<p>on</p>`, fallback: () => html`<p>off</p>` })
    );
    assert.match(out1, /on/);
    setOn(false);
    const out2 = renderToString(() =>
      Show({ when: on, children: () => html`<p>on</p>`, fallback: () => html`<p>off</p>` })
    );
    assert.match(out2, /off/);
  });
});
