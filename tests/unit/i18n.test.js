import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../../src/reactivity.js";
import { createI18n } from "../../src/i18n.js";

function makeI18n(extra = {}) {
  return createI18n({
    defaultLocale: "en",
    fallbackLocale: "en",
    messages: {
      en: {
        greeting: "Hello, {name}!",
        items: "{count} item | {count} items",
        threeForm: "no items | {count} item | {count} items",
        nav: { home: "Home", about: "About" },
        plain: "Just a string"
      },
      es: {
        greeting: "Hola, {name}!",
        items: "{count} elemento | {count} elementos",
        nav: { home: "Inicio" }
      }
    },
    ...extra
  });
}

describe("createI18n — translation", () => {
  it("translates simple key", () => {
    createRoot(dispose => {
      const { t } = makeI18n();
      assert.equal(t("plain"), "Just a string");
      dispose();
    });
  });

  it("interpolates parameters", () => {
    createRoot(dispose => {
      const { t } = makeI18n();
      assert.equal(t("greeting", { name: "Ada" }), "Hello, Ada!");
      dispose();
    });
  });

  it("handles missing parameter gracefully", () => {
    createRoot(dispose => {
      const { t } = makeI18n();
      const result = t("greeting");
      // Should leave {name} or replace with empty
      assert.ok(typeof result === "string");
      dispose();
    });
  });

  it("handles nested keys with dot notation", () => {
    createRoot(dispose => {
      const { t } = makeI18n();
      assert.equal(t("nav.home"), "Home");
      assert.equal(t("nav.about"), "About");
      dispose();
    });
  });

  it("returns key when not found anywhere", () => {
    createRoot(dispose => {
      const { t } = makeI18n();
      assert.equal(t("missing.key"), "missing.key");
      dispose();
    });
  });

  it("falls back to fallback locale", () => {
    createRoot(dispose => {
      const i18n = makeI18n();
      i18n.setLocale("es");
      // "nav.about" doesn't exist in es, should fall back to en
      assert.equal(i18n.t("nav.about"), "About");
      dispose();
    });
  });
});

describe("createI18n — pluralization", () => {
  it("pluralizes with 2 forms (singular | plural)", () => {
    createRoot(dispose => {
      const { t } = makeI18n();
      assert.equal(t("items", { count: 1 }), "1 item");
      assert.equal(t("items", { count: 5 }), "5 items");
      assert.equal(t("items", { count: 0 }), "0 items");
      dispose();
    });
  });

  it("pluralizes with 3 forms (zero | one | other)", () => {
    createRoot(dispose => {
      const { t } = makeI18n();
      assert.equal(t("threeForm", { count: 0 }), "no items");
      assert.equal(t("threeForm", { count: 1 }), "1 item");
      assert.equal(t("threeForm", { count: 42 }), "42 items");
      dispose();
    });
  });
});

describe("createI18n — locale switching", () => {
  it("switches locale reactively", () => {
    createRoot(dispose => {
      const i18n = makeI18n();
      assert.equal(i18n.locale(), "en");
      assert.equal(i18n.t("greeting", { name: "X" }), "Hello, X!");

      i18n.setLocale("es");
      assert.equal(i18n.locale(), "es");
      assert.equal(i18n.t("greeting", { name: "X" }), "Hola, X!");
      dispose();
    });
  });
});

describe("createI18n — lazy loading", () => {
  it("loads locale asynchronously", async () => {
    await new Promise(resolve => {
      createRoot(async dispose => {
        const i18n = makeI18n();
        await i18n.loadLocale("fr", async () => ({
          greeting: "Bonjour, {name}!",
          plain: "Juste un texte"
        }));
        i18n.setLocale("fr");
        assert.equal(i18n.t("greeting", { name: "Ada" }), "Bonjour, Ada!");
        dispose();
        resolve();
      });
    });
  });
});

describe("createI18n — formatting", () => {
  it("formatNumber produces locale-aware string", () => {
    createRoot(dispose => {
      const i18n = makeI18n();
      const result = i18n.formatNumber(1234.5);
      assert.ok(typeof result === "string");
      assert.ok(result.includes("1") && result.includes("234"));
      dispose();
    });
  });

  it("formatDate produces a string", () => {
    createRoot(dispose => {
      const i18n = makeI18n();
      const result = i18n.formatDate(new Date("2024-06-15"));
      assert.ok(typeof result === "string");
      assert.ok(result.length > 0);
      dispose();
    });
  });

  it("formatRelative produces relative string", () => {
    createRoot(dispose => {
      const i18n = makeI18n();
      const recent = new Date(Date.now() - 3600000); // 1 hour ago
      const result = i18n.formatRelative(recent);
      assert.ok(typeof result === "string");
      dispose();
    });
  });
});

describe("createI18n — edge cases", () => {
  it("handles empty messages gracefully", () => {
    createRoot(dispose => {
      const i18n = createI18n({ defaultLocale: "en", messages: {} });
      assert.equal(i18n.t("anything"), "anything");
      dispose();
    });
  });

  it("handles XSS in translation values", () => {
    createRoot(dispose => {
      const i18n = createI18n({
        defaultLocale: "en",
        messages: { en: { xss: '<script>alert("xss")</script>' } }
      });
      // Should return the raw string (escaping is the renderer's job)
      assert.equal(i18n.t("xss"), '<script>alert("xss")</script>');
      dispose();
    });
  });

  it("handles deeply nested keys", () => {
    createRoot(dispose => {
      const i18n = createI18n({
        defaultLocale: "en",
        messages: { en: { a: { b: { c: { d: "deep" } } } } }
      });
      assert.equal(i18n.t("a.b.c.d"), "deep");
      dispose();
    });
  });
});
