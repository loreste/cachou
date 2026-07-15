import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filePathToRoutePath, normalizeGlobModules, createFileRoutes } from "../../src/file-routes.js";

describe("filePathToRoutePath", () => {
  it("maps index to /", () => {
    assert.equal(filePathToRoutePath("routes/index.js"), "/");
    assert.equal(filePathToRoutePath("./routes/index.js"), "/");
  });

  it("maps static segments", () => {
    assert.equal(filePathToRoutePath("routes/about.js"), "/about");
    assert.equal(filePathToRoutePath("routes/blog/post.js"), "/blog/post");
  });

  it("maps dynamic params", () => {
    assert.equal(filePathToRoutePath("routes/users/[id].js"), "/users/:id");
  });

  it("maps catch-all", () => {
    assert.equal(filePathToRoutePath("routes/blog/[...slug].js"), "/blog/*");
    assert.equal(filePathToRoutePath("routes/[...all].js"), "/*");
  });

  it("ignores route groups", () => {
    assert.equal(filePathToRoutePath("routes/(app)/settings.js"), "/settings");
  });
});

describe("createFileRoutes", () => {
  it("builds route nodes from modules", () => {
    const Home = () => "home";
    const About = () => "about";
    const tree = createFileRoutes({
      "routes/index.js": { default: Home },
      "routes/about.js": { default: About }
    });
    assert.ok(Array.isArray(tree));
    assert.ok(tree.length >= 2);
    // Route markers
    const paths = tree.filter(n => n && n.$$cachouRoute).map(n => n.$$cachouRoute.path);
    assert.ok(paths.includes("/"));
    assert.ok(paths.includes("/about"));
  });
});

describe("normalizeGlobModules", () => {
  it("sorts layouts before pages", () => {
    const entries = normalizeGlobModules({
      "routes/app/index.js": () => {},
      "routes/app/layout.js": () => {},
      "routes/about.js": () => {}
    });
    const layoutIdx = entries.findIndex(e => e.isLayout);
    const pageIdx = entries.findIndex(e => !e.isLayout);
    assert.ok(layoutIdx >= 0);
    assert.ok(pageIdx >= 0);
    assert.ok(layoutIdx < pageIdx || entries[0].isLayout);
  });
});
