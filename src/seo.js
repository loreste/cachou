/**
 * CachouJS SEO Utilities
 *
 * Server-side SEO generation helpers: sitemap, robots.txt,
 * Open Graph tags, structured data (JSON-LD), and canonical URLs.
 *
 * @module cachoujs/seo
 */

/* ------------------------------------------------------------------ */
/*  Sitemap                                                           */
/* ------------------------------------------------------------------ */

/**
 * Generate an XML sitemap string.
 *
 * @param {Object} config
 * @param {string} config.baseUrl - Base URL of the site (no trailing slash).
 * @param {Array<{ path: string, changefreq?: string, priority?: number, lastmod?: string }>} config.routes
 * @returns {string} XML sitemap
 */
export function generateSitemap(config) {
  if (!config || !config.baseUrl || !Array.isArray(config.routes)) {
    throw new Error("generateSitemap requires { baseUrl, routes }");
  }

  const base = config.baseUrl.replace(/\/+$/, "");
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const route of config.routes) {
    const loc = `${base}${route.path}`;
    xml += "  <url>\n";
    xml += `    <loc>${escapeXml(loc)}</loc>\n`;
    if (route.lastmod) {
      xml += `    <lastmod>${escapeXml(route.lastmod)}</lastmod>\n`;
    }
    if (route.changefreq) {
      xml += `    <changefreq>${escapeXml(route.changefreq)}</changefreq>\n`;
    }
    if (route.priority != null) {
      xml += `    <priority>${Number(route.priority).toFixed(1)}</priority>\n`;
    }
    xml += "  </url>\n";
  }

  xml += "</urlset>";
  return xml;
}

/* ------------------------------------------------------------------ */
/*  Robots.txt                                                        */
/* ------------------------------------------------------------------ */

/**
 * Generate a robots.txt string.
 *
 * @param {Object} config
 * @param {string[]} [config.allow] - Allowed paths.
 * @param {string[]} [config.disallow] - Disallowed paths.
 * @param {string} [config.sitemap] - URL of the sitemap.
 * @param {number} [config.crawlDelay] - Crawl delay in seconds.
 * @param {string} [config.userAgent="*"] - User agent string.
 * @returns {string}
 */
export function generateRobots(config = {}) {
  const userAgent = config.userAgent || "*";
  const lines = [`User-agent: ${userAgent}`];

  if (Array.isArray(config.allow)) {
    for (const path of config.allow) {
      lines.push(`Allow: ${path}`);
    }
  }

  if (Array.isArray(config.disallow)) {
    for (const path of config.disallow) {
      lines.push(`Disallow: ${path}`);
    }
  }

  if (config.crawlDelay != null) {
    lines.push(`Crawl-delay: ${config.crawlDelay}`);
  }

  if (config.sitemap) {
    lines.push("");
    lines.push(`Sitemap: ${config.sitemap}`);
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Open Graph Tags                                                   */
/* ------------------------------------------------------------------ */

/**
 * Generate Open Graph meta tag descriptors for use with `useHead({ meta })`.
 *
 * @param {Object} config
 * @param {string} config.title
 * @param {string} [config.description]
 * @param {string} [config.image]
 * @param {string} [config.url]
 * @param {string} [config.type="website"]
 * @param {string} [config.siteName]
 * @param {string} [config.locale]
 * @param {number} [config.imageWidth]
 * @param {number} [config.imageHeight]
 * @returns {Array<{ property: string, content: string }>}
 */
export function ogTags(config) {
  if (!config || !config.title) {
    throw new Error("ogTags requires at least a title");
  }

  /** @type {Array<{ property: string, content: string }>} */
  const meta = [];

  meta.push({ property: "og:title", content: config.title });

  if (config.description) {
    meta.push({ property: "og:description", content: config.description });
  }
  if (config.image) {
    meta.push({ property: "og:image", content: config.image });
    if (config.imageWidth) {
      meta.push({ property: "og:image:width", content: String(config.imageWidth) });
    }
    if (config.imageHeight) {
      meta.push({ property: "og:image:height", content: String(config.imageHeight) });
    }
  }
  if (config.url) {
    meta.push({ property: "og:url", content: config.url });
  }

  meta.push({ property: "og:type", content: config.type || "website" });

  if (config.siteName) {
    meta.push({ property: "og:site_name", content: config.siteName });
  }
  if (config.locale) {
    meta.push({ property: "og:locale", content: config.locale });
  }

  return meta;
}

/* ------------------------------------------------------------------ */
/*  Structured Data (JSON-LD)                                         */
/* ------------------------------------------------------------------ */

/**
 * Structured data helpers that return JSON-LD objects
 * for use with `useHead({ jsonld: [...] })`.
 */
export const structuredData = {
  /**
   * Article structured data.
   *
   * @param {Object} config
   * @param {string} config.headline
   * @param {string} [config.author]
   * @param {string} [config.datePublished]
   * @param {string} [config.dateModified]
   * @param {string} [config.image]
   * @param {string} [config.description]
   * @param {string} [config.publisher]
   * @returns {Object} JSON-LD object
   */
  article(config) {
    const ld = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: config.headline,
    };

    if (config.author) {
      ld.author = { "@type": "Person", name: config.author };
    }
    if (config.datePublished) {
      ld.datePublished = config.datePublished;
    }
    if (config.dateModified) {
      ld.dateModified = config.dateModified;
    }
    if (config.image) {
      ld.image = config.image;
    }
    if (config.description) {
      ld.description = config.description;
    }
    if (config.publisher) {
      ld.publisher = { "@type": "Organization", name: config.publisher };
    }

    return ld;
  },

  /**
   * Product structured data.
   *
   * @param {Object} config
   * @param {string} config.name
   * @param {number} [config.price]
   * @param {string} [config.currency="USD"]
   * @param {string} [config.availability="InStock"]
   * @param {string} [config.description]
   * @param {string} [config.image]
   * @param {string} [config.brand]
   * @param {string} [config.sku]
   * @returns {Object} JSON-LD object
   */
  product(config) {
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: config.name,
    };

    if (config.description) {
      ld.description = config.description;
    }
    if (config.image) {
      ld.image = config.image;
    }
    if (config.brand) {
      ld.brand = { "@type": "Brand", name: config.brand };
    }
    if (config.sku) {
      ld.sku = config.sku;
    }
    if (config.price != null) {
      ld.offers = {
        "@type": "Offer",
        price: config.price,
        priceCurrency: config.currency || "USD",
        availability: `https://schema.org/${config.availability || "InStock"}`,
      };
    }

    return ld;
  },

  /**
   * Organization structured data.
   *
   * @param {Object} config
   * @param {string} config.name
   * @param {string} [config.url]
   * @param {string} [config.logo]
   * @param {string} [config.description]
   * @param {string[]} [config.sameAs] - Social profile URLs.
   * @returns {Object} JSON-LD object
   */
  organization(config) {
    const ld = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: config.name,
    };

    if (config.url) {
      ld.url = config.url;
    }
    if (config.logo) {
      ld.logo = config.logo;
    }
    if (config.description) {
      ld.description = config.description;
    }
    if (Array.isArray(config.sameAs) && config.sameAs.length > 0) {
      ld.sameAs = config.sameAs;
    }

    return ld;
  },

  /**
   * Breadcrumb structured data.
   *
   * @param {Array<{ name: string, url: string }>} items
   * @returns {Object} JSON-LD object
   */
  breadcrumb(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("structuredData.breadcrumb requires a non-empty array of items");
    }

    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    };
  },
};

/* ------------------------------------------------------------------ */
/*  Canonical URL                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a canonical URL link descriptor, stripping query params and fragments.
 * For use with `useHead({ links: [canonicalUrl(...)] })`.
 *
 * @param {string} url - Full URL (query/fragment will be removed).
 * @returns {{ rel: string, href: string }}
 */
export function canonicalUrl(url) {
  let href = url;
  try {
    const parsed = new URL(url);
    href = `${parsed.origin}${parsed.pathname}`;
  } catch (_) {
    // If URL parsing fails, strip query/fragment manually
    href = url.split("?")[0].split("#")[0];
  }
  return { rel: "canonical", href };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Escape special XML characters.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
