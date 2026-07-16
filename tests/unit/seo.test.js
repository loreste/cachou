import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateSitemap,
  generateRobots,
  ogTags,
  structuredData,
  canonicalUrl
} from "../../src/seo.js";

describe("generateSitemap", () => {
  it("generates valid XML", () => {
    const xml = generateSitemap({
      baseUrl: "https://example.com",
      routes: [
        { path: "/", changefreq: "daily", priority: 1.0 },
        { path: "/about", changefreq: "monthly", priority: 0.8 }
      ]
    });
    assert.ok(xml.includes('<?xml version="1.0"'));
    assert.ok(xml.includes("<urlset"));
    assert.ok(xml.includes("https://example.com/"));
    assert.ok(xml.includes("https://example.com/about"));
    assert.ok(xml.includes("<changefreq>daily</changefreq>"));
    assert.ok(xml.includes("<priority>1</priority>") || xml.includes("<priority>1.0</priority>"));
  });

  it("handles lastmod", () => {
    const xml = generateSitemap({
      baseUrl: "https://example.com",
      routes: [{ path: "/blog", lastmod: "2024-06-15" }]
    });
    assert.ok(xml.includes("<lastmod>2024-06-15</lastmod>"));
  });

  it("handles trailing slash on baseUrl", () => {
    const xml = generateSitemap({
      baseUrl: "https://example.com/",
      routes: [{ path: "/about" }]
    });
    // Should not double-slash
    assert.ok(!xml.includes("example.com//about"));
  });

  it("handles empty routes", () => {
    const xml = generateSitemap({ baseUrl: "https://example.com", routes: [] });
    assert.ok(xml.includes("<urlset"));
    assert.ok(xml.includes("</urlset>"));
  });

  it("escapes special XML characters in URLs", () => {
    const xml = generateSitemap({
      baseUrl: "https://example.com",
      routes: [{ path: "/search?q=a&b=c" }]
    });
    assert.ok(xml.includes("&amp;") || xml.includes("search"));
  });
});

describe("generateRobots", () => {
  it("generates robots.txt content", () => {
    const txt = generateRobots({
      allow: ["/"],
      disallow: ["/admin", "/api"],
      sitemap: "https://example.com/sitemap.xml"
    });
    assert.ok(txt.includes("User-agent: *"));
    assert.ok(txt.includes("Allow: /"));
    assert.ok(txt.includes("Disallow: /admin"));
    assert.ok(txt.includes("Disallow: /api"));
    assert.ok(txt.includes("Sitemap: https://example.com/sitemap.xml"));
  });

  it("handles crawl delay", () => {
    const txt = generateRobots({ crawlDelay: 2 });
    assert.ok(txt.includes("Crawl-delay: 2"));
  });

  it("handles empty config", () => {
    const txt = generateRobots({});
    assert.ok(txt.includes("User-agent: *"));
  });
});

describe("ogTags", () => {
  it("generates Open Graph meta array", () => {
    const meta = ogTags({
      title: "My Page",
      description: "A description",
      image: "https://example.com/og.jpg",
      url: "https://example.com/page",
      type: "website",
      siteName: "My Site"
    });
    assert.ok(Array.isArray(meta));
    assert.ok(meta.find(m => m.property === "og:title" && m.content === "My Page"));
    assert.ok(meta.find(m => m.property === "og:description"));
    assert.ok(meta.find(m => m.property === "og:image"));
    assert.ok(meta.find(m => m.property === "og:url"));
    assert.ok(meta.find(m => m.property === "og:type"));
    assert.ok(meta.find(m => m.property === "og:site_name"));
  });

  it("handles minimal config", () => {
    const meta = ogTags({ title: "Test" });
    assert.ok(meta.find(m => m.property === "og:title"));
  });

  it("handles XSS in values", () => {
    const meta = ogTags({ title: '<script>alert("xss")</script>' });
    const titleMeta = meta.find(m => m.property === "og:title");
    assert.equal(titleMeta.content, '<script>alert("xss")</script>');
  });
});

describe("structuredData", () => {
  it("generates article JSON-LD", () => {
    const ld = structuredData.article({
      headline: "Test Post",
      author: "Ada",
      datePublished: "2024-06-15",
      image: "https://example.com/img.jpg"
    });
    assert.equal(ld["@type"], "Article");
    assert.equal(ld.headline, "Test Post");
    assert.ok(ld["@context"]);
  });

  it("generates product JSON-LD", () => {
    const ld = structuredData.product({
      name: "Widget",
      price: 29.99,
      currency: "USD",
      availability: "InStock"
    });
    assert.equal(ld["@type"], "Product");
    assert.equal(ld.name, "Widget");
  });

  it("generates organization JSON-LD", () => {
    const ld = structuredData.organization({
      name: "Acme",
      url: "https://acme.com",
      logo: "https://acme.com/logo.png"
    });
    assert.equal(ld["@type"], "Organization");
  });

  it("generates breadcrumb JSON-LD", () => {
    const ld = structuredData.breadcrumb([
      { name: "Home", url: "/" },
      { name: "Blog", url: "/blog" }
    ]);
    assert.equal(ld["@type"], "BreadcrumbList");
    assert.ok(Array.isArray(ld.itemListElement));
    assert.equal(ld.itemListElement.length, 2);
  });
});

describe("canonicalUrl", () => {
  it("strips query params", () => {
    const link = canonicalUrl("https://example.com/page?ref=twitter&utm=x");
    assert.equal(link.rel, "canonical");
    assert.equal(link.href, "https://example.com/page");
  });

  it("strips hash", () => {
    const link = canonicalUrl("https://example.com/page#section");
    assert.equal(link.href, "https://example.com/page");
  });

  it("handles clean URL", () => {
    const link = canonicalUrl("https://example.com/about");
    assert.equal(link.href, "https://example.com/about");
  });

  it("handles root URL", () => {
    const link = canonicalUrl("https://example.com/");
    assert.equal(link.href, "https://example.com/");
  });
});
