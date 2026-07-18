import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  routeToFilePath,
  prerenderRoutes,
  writePrerendered,
  prerenderToDir
} from "../../src/static.js";
import { html, signal, Show } from "../../src/index.js";

function App() {
  const [n] = signal(7);
  return Show({
    when: () => true,
    children: () => html`<main data-static="1"><h1>Static ${() => n()}</h1></main>`
  });
}

describe("routeToFilePath", () => {
  it("maps / to index.html", () => {
    assert.equal(routeToFilePath("/"), "index.html");
    assert.equal(routeToFilePath(""), "index.html");
  });

  it("maps nested paths to .../index.html", () => {
    assert.equal(routeToFilePath("/about"), "about/index.html");
    assert.equal(routeToFilePath("/blog/post/"), "blog/post/index.html");
  });

  it("strips query and hash", () => {
    assert.equal(routeToFilePath("/x?y=1#z"), "x/index.html");
  });
});

describe("prerenderRoutes", () => {
  it("requires routes", async () => {
    await assert.rejects(() => prerenderRoutes(App, {}), /routes/);
  });

  it("renders multiple routes to full documents", async () => {
    const pages = await prerenderRoutes(App, {
      routes: ["/", "/about"],
      title: ({ path }) => (path === "/" ? "Home" : "About"),
      styles: "<style>body{margin:0}</style>",
      nonce: false
    });
    assert.equal(pages.length, 2);
    assert.equal(pages[0].file, "index.html");
    assert.equal(pages[1].file, "about/index.html");
    assert.match(pages[0].html, /data-static="1"/);
    assert.match(pages[0].html, /Static/);
    assert.match(pages[0].html, /<title>Home<\/title>/);
    assert.match(pages[1].html, /<title>About<\/title>/);
    assert.match(pages[0].html, /__CACHOU_STATE__/);
  });

  it("accepts route objects with per-route title", async () => {
    const pages = await prerenderRoutes(App, {
      routes: [{ path: "/only", title: "Only" }],
      nonce: false
    });
    assert.match(pages[0].html, /<title>Only<\/title>/);
  });

  it("supports concurrent mode", async () => {
    const pages = await prerenderRoutes(App, {
      routes: ["/", "/a", "/b"],
      concurrent: true,
      nonce: false
    });
    assert.equal(pages.length, 3);
    for (const p of pages) {
      assert.match(p.html, /data-static/);
    }
  });
});

describe("writePrerendered / prerenderToDir", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "cachou-prerender-"));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes files under outDir", async () => {
    const pages = await prerenderRoutes(App, {
      routes: ["/", "/docs"],
      title: "W",
      nonce: false
    });
    const written = await writePrerendered(pages, dir);
    assert.equal(written.length, 2);
    assert.ok(existsSync(join(dir, "index.html")));
    assert.ok(existsSync(join(dir, "docs", "index.html")));
    const html = readFileSync(join(dir, "index.html"), "utf8");
    assert.match(html, /Static/);
  });

  it("prerenderToDir dryRun does not write", async () => {
    const dry = join(dir, "dry");
    const { written } = await prerenderToDir(App, {
      routes: ["/dry"],
      outDir: dry,
      dryRun: true,
      nonce: false
    });
    assert.equal(written.length, 1);
    assert.equal(existsSync(join(dry, "dry", "index.html")), false);
  });
});
