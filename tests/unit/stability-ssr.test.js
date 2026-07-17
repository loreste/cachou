import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getExportStability,
  listExportsByStability,
  STABLE_EXPORTS,
  EXPERIMENTAL_EXPORTS,
  renderApplication,
  htmlDocument,
  html,
  signal,
  createResource,
  Show
} from "../../src/index.js";

describe("API stability labels", () => {
  it("labels core exports stable", () => {
    assert.equal(getExportStability("signal"), "stable");
    assert.equal(getExportStability("html"), "stable");
    assert.equal(getExportStability("createResource"), "stable");
    assert.equal(getExportStability("renderApplication"), "stable");
    assert.equal(getExportStability("Router"), "stable");
  });

  it("labels app kits experimental", () => {
    assert.equal(getExportStability("createAuth"), "experimental");
    assert.equal(getExportStability("createToast"), "experimental");
    assert.equal(getExportStability("createI18n"), "experimental");
  });

  it("labels streaming candidate", () => {
    assert.equal(getExportStability("renderToStream"), "candidate");
    assert.equal(getExportStability("Island"), "candidate");
  });

  it("lists stable exports as a non-empty array", () => {
    const list = listExportsByStability("stable");
    assert.ok(Array.isArray(list));
    assert.ok(list.includes("signal"));
    assert.ok(STABLE_EXPORTS.length >= 40);
    assert.ok(EXPERIMENTAL_EXPORTS.includes("createAuth"));
  });

  it("returns unlisted for unknown names", () => {
    assert.equal(getExportStability("notARealExport_xyz"), "unlisted");
  });
});

describe("renderApplication + htmlDocument", () => {
  it("renders async app with explicit context and document shell", async () => {
    function App() {
      const [n] = signal(2);
      const [msg] = createResource(
        async () => {
          await new Promise(r => setTimeout(r, 5));
          return "ok";
        },
        { revalidateOnFocus: false, revalidateOnReconnect: false }
      );
      return Show({
        when: () => true,
        children: () => html`<p data-n=${() => n()}>${() => msg() || "…"}</p>`
      });
    }

    const { html: body, head, state, context } = await renderApplication(App, {
      path: "/",
      nonce: "testnonce01"
    });

    assert.ok(context);
    assert.match(body, /ok/);
    assert.match(state, /__CACHOU_STATE__/);
    assert.match(state, /nonce="testnonce01"/);

    const page = htmlDocument({
      html: body,
      head,
      state,
      title: "T",
      styles: `<style nonce="testnonce01">body{}</style>`
    });
    assert.match(page, /<!DOCTYPE html>/);
    assert.match(page, /<title>T<\/title>/);
    assert.match(page, /data-n/);
  });

  it("escapes title in htmlDocument", () => {
    const page = htmlDocument({ html: "", title: `</title><script>x</script>` });
    assert.doesNotMatch(page, /<script>x<\/script>/);
    assert.match(page, /&lt;\/title&gt;/);
  });
});
