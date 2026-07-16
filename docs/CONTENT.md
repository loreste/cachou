# Content Collections

Content collections give you a structured way to manage blog posts, docs, changelogs, or any file-based content. Define a schema, load your files, and query them with type-safe validation.

---

## Table of contents

1. [Defining a collection](#defining-a-collection)
2. [The `z` schema builder](#the-z-schema-builder)
3. [Querying content](#querying-content)
4. [Parsing frontmatter](#parsing-frontmatter)
5. [Server-side loading with `loadContent`](#server-side-loading-with-loadcontent)
6. [Client-side usage](#client-side-usage)
7. [Building a blog](#building-a-blog)

---

## Defining a collection

`defineCollection` registers a collection with a name, an optional schema, and an optional directory (for server-side loading).

```javascript
import { defineCollection, z } from "cachoujs";

const posts = defineCollection({
  name: "posts",
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()),
    draft: z.optional(z.boolean()),
    excerpt: z.optional(z.string())
  }),
  directory: "./content/posts"
});
```

The schema is optional but recommended. When present, every entry gets validated on retrieval — invalid entries still come back, but they include `_valid: false` and `_errors` so you can filter or warn.

---

## The `z` schema builder

`z` is a minimal Zod-like validation builder. It doesn't try to replace Zod — it covers the common cases for content frontmatter without adding a dependency.

### Available types

```javascript
z.string()                    // must be a string
z.number()                    // must be a finite number
z.boolean()                   // must be true or false
z.date()                      // Date object or parseable date string
z.array(z.string())           // array where each element matches inner schema
z.object({ key: z.string() }) // object matching a shape
z.optional(z.string())        // allows null or undefined
z.enum(["draft", "published", "archived"])  // must be one of the values
```

### Validation

Every schema returns `{ valid: boolean, errors?: string[] }` from its `validate()` method.

```javascript
const schema = z.object({
  title: z.string(),
  count: z.number()
});

schema.validate({ title: "Hello", count: 5 });
// { valid: true }

schema.validate({ title: "Hello", count: "five" });
// { valid: false, errors: ["count: expected number, got string"] }
```

### Nested objects and arrays

```javascript
const authorSchema = z.object({
  name: z.string(),
  avatar: z.optional(z.string()),
  links: z.array(z.object({
    label: z.string(),
    url: z.string()
  }))
});
```

---

## Querying content

### `getCollection(name)`

Returns all entries from a collection as an array of `{ slug, data, body?, rawContent? }` objects.

```javascript
import { getCollection } from "cachoujs";

const allPosts = getCollection("posts");

// Filter and sort
const published = allPosts
  .filter(post => !post.data.draft)
  .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
```

### `getEntry(collection, slug)`

Returns a single entry by slug, or `null` if not found.

```javascript
import { getEntry } from "cachoujs";

const post = getEntry("posts", "hello-world");
if (post) {
  console.log(post.data.title); // "Hello World"
  console.log(post.body);       // markdown body without frontmatter
}
```

Slugs are derived from filenames with the extension stripped: `hello-world.md` becomes `"hello-world"`.

---

## Parsing frontmatter

`parseFrontmatter` extracts YAML-like frontmatter from markdown content. It handles basic types: strings, numbers, booleans, dates, and inline arrays.

```javascript
import { parseFrontmatter } from "cachoujs";

const raw = `---
title: Building a blog with Cachou
date: 2025-03-15
tags: [cachou, tutorial, javascript]
draft: false
---

This is the post body. It supports **markdown**.
`;

const { data, body } = parseFrontmatter(raw);
// data = {
//   title: "Building a blog with Cachou",
//   date: Date("2025-03-15"),
//   tags: ["cachou", "tutorial", "javascript"],
//   draft: false
// }
// body = "This is the post body. It supports **markdown**."
```

Type coercion rules:

- `true` / `false` become booleans
- ISO date strings become Date objects
- Numbers become numbers
- `[a, b, c]` inline arrays are parsed
- Quoted strings have quotes stripped
- Everything else stays a string

This is intentionally simple. If you need full YAML support, parse with a YAML library and pass the result to `addEntries`.

---

## Server-side loading with `loadContent`

On the server (Node.js), `loadContent` reads files from the filesystem and populates the collection registry.

```javascript
import { loadContent, z } from "cachoujs";

await loadContent([
  {
    name: "posts",
    directory: "./content/posts",
    schema: z.object({
      title: z.string(),
      date: z.date(),
      tags: z.array(z.string())
    })
  },
  {
    name: "docs",
    directory: "./content/docs",
    schema: z.object({
      title: z.string(),
      order: z.number()
    })
  }
]);
```

It reads `.md`, `.mdx`, and `.json` files from each directory. Markdown files get their frontmatter parsed automatically. JSON files are parsed and stored as `{ data }` entries. Other file types are skipped.

After loading, you query with `getCollection` and `getEntry` as usual.

---

## Client-side usage

On the client, you typically load content via an API and add it to the registry manually with `addEntries`.

```javascript
import { defineCollection, addEntries, getCollection, z, createResource } from "cachoujs";

// Define the collection shape
const posts = defineCollection({
  name: "posts",
  schema: z.object({
    title: z.string(),
    date: z.date(),
    excerpt: z.optional(z.string())
  })
});

// Fetch and populate
const [data] = createResource(async () => {
  const res = await fetch("/api/posts");
  return res.json();
});

// When data arrives, add to the collection
effect(() => {
  const posts = data();
  if (posts) {
    addEntries("posts", posts.map(p => ({
      slug: p.slug,
      data: p,
      body: p.content
    })));
  }
});
```

---

## Building a blog

Here's a complete example: a blog with an index page and individual post pages.

### Content structure

```
content/
  posts/
    hello-world.md
    building-with-cachou.md
    deploy-guide.md
```

### Server setup

```javascript
import { loadContent, getCollection, getEntry, z } from "cachoujs";

await loadContent([
  {
    name: "posts",
    directory: "./content/posts",
    schema: z.object({
      title: z.string(),
      date: z.date(),
      tags: z.array(z.string()),
      excerpt: z.optional(z.string()),
      draft: z.optional(z.boolean())
    })
  }
]);

// In your request handler
function handleBlogIndex(req, res) {
  const posts = getCollection("posts")
    .filter(p => !p.data.draft)
    .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));

  // Pass to your template or SSR render
  return renderPage(BlogIndex, { posts });
}

function handleBlogPost(req, res) {
  const post = getEntry("posts", req.params.slug);
  if (!post) return res.status(404).send("Not found");
  return renderPage(BlogPost, { post });
}
```

### Blog components

```javascript
import { html, Router, Route } from "cachoujs";

function BlogIndex({ posts }) {
  return html`
    <div class="blog">
      <h1>Blog</h1>
      ${posts.map(post => html`
        <article>
          <h2><a href=${`/blog/${post.slug}`}>${post.data.title}</a></h2>
          <time>${post.data.date.toLocaleDateString()}</time>
          ${post.data.excerpt ? html`<p>${post.data.excerpt}</p>` : ""}
          <div class="tags">
            ${post.data.tags.map(tag => html`<span class="tag">${tag}</span>`)}
          </div>
        </article>
      `)}
    </div>
  `;
}

function BlogPost({ post }) {
  return html`
    <article class="post">
      <h1>${post.data.title}</h1>
      <time>${post.data.date.toLocaleDateString()}</time>
      <div class="content">${post.body}</div>
    </article>
  `;
}
```

For rendering markdown to HTML in the browser, pair this with a lightweight markdown renderer. Content collections handle the data layer — rendering is up to you.

---

## Next steps

- [Guide](./GUIDE.md) — full framework walkthrough
- [API reference](./API.md) — content collection signatures
