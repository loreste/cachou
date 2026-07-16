/**
 * Content collections system for CachouJS.
 *
 * Provides structured content management for blog posts,
 * docs, and other content types.  Works both client-side (pre-loaded data)
 * and server-side (reading files from the filesystem).
 *
 * @module cachoujs/content
 */

// ---------------------------------------------------------------------------
// Schema builder (mini Zod-like validation)
// ---------------------------------------------------------------------------

/**
 * Minimal schema builder.  Each method returns an object with a
 * `validate(value)` function that returns `{ valid: boolean, errors?: string[] }`.
 */
export const z = {
  /**
   * Validates that the value is a string.
   * @returns {{ validate(value: any): { valid: boolean, errors?: string[] } }}
   */
  string() {
    return {
      validate(value) {
        if (typeof value === "string") return { valid: true };
        return { valid: false, errors: [`expected string, got ${typeof value}`] };
      }
    };
  },

  /**
   * Validates that the value is a number.
   * @returns {{ validate(value: any): { valid: boolean, errors?: string[] } }}
   */
  number() {
    return {
      validate(value) {
        if (typeof value === "number" && !Number.isNaN(value)) return { valid: true };
        return { valid: false, errors: [`expected number, got ${typeof value}`] };
      }
    };
  },

  /**
   * Validates that the value is a boolean.
   * @returns {{ validate(value: any): { valid: boolean, errors?: string[] } }}
   */
  boolean() {
    return {
      validate(value) {
        if (typeof value === "boolean") return { valid: true };
        return { valid: false, errors: [`expected boolean, got ${typeof value}`] };
      }
    };
  },

  /**
   * Validates that the value is a Date instance (or a string parseable as a date).
   * @returns {{ validate(value: any): { valid: boolean, errors?: string[] } }}
   */
  date() {
    return {
      validate(value) {
        if (value instanceof Date && !isNaN(value.getTime())) return { valid: true };
        if (typeof value === "string") {
          const d = new Date(value);
          if (!isNaN(d.getTime())) return { valid: true };
        }
        return { valid: false, errors: [`expected date, got ${typeof value}`] };
      }
    };
  },

  /**
   * Validates that the value is an array where each element matches `inner`.
   * @param {{ validate(value: any): { valid: boolean, errors?: string[] } }} inner
   * @returns {{ validate(value: any): { valid: boolean, errors?: string[] } }}
   */
  array(inner) {
    return {
      validate(value) {
        if (!Array.isArray(value)) {
          return { valid: false, errors: [`expected array, got ${typeof value}`] };
        }
        const errors = [];
        for (let i = 0; i < value.length; i++) {
          const result = inner.validate(value[i]);
          if (!result.valid) {
            for (const e of result.errors || []) {
              errors.push(`[${i}]: ${e}`);
            }
          }
        }
        if (errors.length > 0) return { valid: false, errors };
        return { valid: true };
      }
    };
  },

  /**
   * Validates that the value is an object matching the given shape.
   * @param {Record<string, { validate(value: any): { valid: boolean, errors?: string[] } }>} shape
   * @returns {{ validate(value: any): { valid: boolean, errors?: string[] } }}
   */
  object(shape) {
    return {
      validate(value) {
        if (value == null || typeof value !== "object" || Array.isArray(value)) {
          return { valid: false, errors: [`expected object, got ${typeof value}`] };
        }
        const errors = [];
        for (const key of Object.keys(shape)) {
          const result = shape[key].validate(value[key]);
          if (!result.valid) {
            for (const e of result.errors || []) {
              errors.push(`${key}: ${e}`);
            }
          }
        }
        if (errors.length > 0) return { valid: false, errors };
        return { valid: true };
      }
    };
  },

  /**
   * Wraps another schema to allow undefined/null values.
   * @param {{ validate(value: any): { valid: boolean, errors?: string[] } }} inner
   * @returns {{ validate(value: any): { valid: boolean, errors?: string[] } }}
   */
  optional(inner) {
    return {
      validate(value) {
        if (value === undefined || value === null) return { valid: true };
        return inner.validate(value);
      }
    };
  },

  /**
   * Validates that the value is one of the allowed values.
   * @param {any[]} values
   * @returns {{ validate(value: any): { valid: boolean, errors?: string[] } }}
   */
  enum(values) {
    return {
      validate(value) {
        if (values.includes(value)) return { valid: true };
        return { valid: false, errors: [`expected one of [${values.join(", ")}], got ${JSON.stringify(value)}`] };
      }
    };
  }
};

// ---------------------------------------------------------------------------
// Collection registry
// ---------------------------------------------------------------------------

/** @type {Map<string, { name: string, schema: any, directory?: string, entries: Map<string, any> }>} */
const collections = new Map();

/**
 * Define a content collection.
 *
 * @param {{ name: string, schema?: { validate(entry: any): { valid: boolean, errors?: string[] } }, directory?: string }} config
 * @returns {{ name: string, schema: any, directory?: string }}
 */
export function defineCollection(config) {
  if (!config || !config.name) {
    throw new Error("[CachouJS Content]: defineCollection requires a `name`.");
  }

  const collection = {
    name: config.name,
    schema: config.schema || null,
    directory: config.directory || null,
    entries: new Map()
  };

  collections.set(config.name, collection);
  return collection;
}

/**
 * Validate a single entry against a collection schema.
 *
 * @param {any} schema
 * @param {any} entry
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateEntry(schema, entry) {
  if (!schema) return { valid: true };

  // Schema can be a z.object or a plain function
  if (typeof schema.validate === "function") {
    return schema.validate(entry.data || entry);
  }
  if (typeof schema === "function") {
    return schema(entry);
  }
  return { valid: true };
}

/**
 * Retrieve all entries from a collection.
 * Returns an array of `{ slug, data, body?, rawContent? }` objects.
 *
 * @param {string|{ name: string }} collection - Collection name or object.
 * @returns {Array<{ slug: string, data: any, body?: string, rawContent?: string }>}
 */
export function getCollection(collection) {
  const name = typeof collection === "string" ? collection : collection.name;
  const col = collections.get(name);
  if (!col) {
    throw new Error(`[CachouJS Content]: collection "${name}" is not defined.`);
  }

  const result = [];
  for (const [slug, entry] of col.entries) {
    const item = { slug, ...entry };
    if (col.schema) {
      const validation = validateEntry(col.schema, item);
      if (!validation.valid) {
        console.warn(
          `[CachouJS Content]: validation errors in "${name}/${slug}":`,
          validation.errors
        );
      }
      item._valid = validation.valid;
      item._errors = validation.errors || [];
    }
    result.push(item);
  }

  return result;
}

/**
 * Retrieve a single entry by slug.
 *
 * @param {string|{ name: string }} collection - Collection name or object.
 * @param {string} slug - Entry slug.
 * @returns {{ slug: string, data: any, body?: string, rawContent?: string } | null}
 */
export function getEntry(collection, slug) {
  const name = typeof collection === "string" ? collection : collection.name;
  const col = collections.get(name);
  if (!col) {
    throw new Error(`[CachouJS Content]: collection "${name}" is not defined.`);
  }

  const entry = col.entries.get(slug);
  if (!entry) return null;

  const item = { slug, ...entry };
  if (col.schema) {
    const validation = validateEntry(col.schema, item);
    item._valid = validation.valid;
    item._errors = validation.errors || [];
  }

  return item;
}

// ---------------------------------------------------------------------------
// Frontmatter parser (lightweight, no full YAML dependency)
// ---------------------------------------------------------------------------

/**
 * Parse simple YAML-like frontmatter from markdown content.
 * Supports `key: value` per line with basic type coercion.
 *
 * @param {string} content - Raw markdown string.
 * @returns {{ data: Record<string, any>, body: string }}
 */
export function parseFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { data: {}, body: content };
  }

  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { data: {}, body: content };
  }

  const frontmatterBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 4).trim();
  const data = {};

  for (const line of frontmatterBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (key === "") continue;

    // Type coercion
    if (value === "true") {
      data[key] = true;
    } else if (value === "false") {
      data[key] = false;
    } else if (value === "null" || value === "") {
      data[key] = value === "" ? "" : null;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      // Date-like strings
      const d = new Date(value);
      data[key] = isNaN(d.getTime()) ? value : d;
    } else if (!isNaN(Number(value)) && value !== "") {
      data[key] = Number(value);
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      data[key] = value.slice(1, -1);
    } else if (value.startsWith("[") && value.endsWith("]")) {
      // Simple inline array: [a, b, c]
      const inner = value.slice(1, -1);
      data[key] = inner.split(",").map((s) => coerceValue(s.trim()));
    } else {
      data[key] = value;
    }
  }

  return { data, body };
}

/**
 * Coerce a simple string value to its JS type.
 * @param {string} value
 * @returns {any}
 */
function coerceValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (!isNaN(Number(value)) && value !== "") return Number(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Derive a slug from a filename.
 * @param {string} filename
 * @returns {string}
 */
function slugFromFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, "")   // strip extension
    .replace(/\\/g, "/")        // normalize separators
    .replace(/^\/+|\/+$/g, ""); // trim slashes
}

// ---------------------------------------------------------------------------
// Server-side collection loader
// ---------------------------------------------------------------------------

/**
 * Create a loader that reads content from the filesystem and populates
 * the collection registries.
 *
 * Requires Node.js `fs` and `path` modules (server-side only).
 *
 * @param {Array<{ name: string, schema?: any, directory: string }>} collectionConfigs
 * @returns {Promise<void>}
 */
export async function loadContent(collectionConfigs) {
  // Dynamic import of Node built-ins so this module stays browser-safe.
  let fs, path;
  try {
    fs = await import("node:fs/promises");
    path = await import("node:path");
  } catch {
    throw new Error(
      "[CachouJS Content]: createCollectionLoader requires Node.js (fs, path)."
    );
  }

  for (const config of collectionConfigs) {
    const col = defineCollection(config);
    const dir = config.directory;

    if (!dir) {
      console.warn(
        `[CachouJS Content]: collection "${config.name}" has no directory; skipping.`
      );
      continue;
    }

    let files;
    try {
      files = await fs.readdir(dir);
    } catch (err) {
      console.warn(
        `[CachouJS Content]: could not read directory "${dir}" for collection "${config.name}":`,
        err.message
      );
      continue;
    }

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) continue;

      const ext = path.extname(file).toLowerCase();
      const slug = slugFromFilename(file);

      if (ext === ".md" || ext === ".mdx") {
        const raw = await fs.readFile(fullPath, "utf-8");
        const { data, body } = parseFrontmatter(raw);
        col.entries.set(slug, { data, body, rawContent: raw });
      } else if (ext === ".json") {
        const raw = await fs.readFile(fullPath, "utf-8");
        try {
          const data = JSON.parse(raw);
          col.entries.set(slug, { data, rawContent: raw });
        } catch (parseErr) {
          console.warn(
            `[CachouJS Content]: failed to parse JSON "${fullPath}":`,
            parseErr.message
          );
        }
      }
      // Other file types are silently skipped.
    }
  }
}

/**
 * Manually add entries to a collection (useful on the client side when
 * content has been pre-loaded or fetched via an API).
 *
 * @param {string|{ name: string }} collection
 * @param {Array<{ slug: string, data: any, body?: string }>} entries
 */
export function addEntries(collection, entries) {
  const name = typeof collection === "string" ? collection : collection.name;
  let col = collections.get(name);
  if (!col) {
    col = defineCollection({ name });
  }
  for (const entry of entries) {
    col.entries.set(entry.slug, {
      data: entry.data,
      body: entry.body || "",
      rawContent: entry.rawContent || ""
    });
  }
}

/**
 * Clear all entries from a collection.
 *
 * @param {string|{ name: string }} collection
 */
export function clearCollection(collection) {
  const name = typeof collection === "string" ? collection : collection.name;
  const col = collections.get(name);
  if (col) col.entries.clear();
}
