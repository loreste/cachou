/**
 * SEO utilities for Cachou.
 *
 * @module cachoujs/seo
 */
declare module "cachoujs/seo" {
  // -------------------------------------------------------------------------
  // Sitemap
  // -------------------------------------------------------------------------

  export interface SitemapRoute {
    /** URL path (appended to baseUrl). */
    path: string;
    /** Change frequency hint. */
    changefreq?: string;
    /** Priority (0.0 to 1.0). */
    priority?: number;
    /** Last modification date (ISO 8601 string). */
    lastmod?: string;
  }

  export interface SitemapConfig {
    /** Base URL of the site (no trailing slash). */
    baseUrl: string;
    /** Array of route entries. */
    routes: SitemapRoute[];
  }

  /**
   * Generate an XML sitemap string.
   */
  export function generateSitemap(config: SitemapConfig): string;

  // -------------------------------------------------------------------------
  // Robots.txt
  // -------------------------------------------------------------------------

  export interface RobotsConfig {
    /** Allowed paths. */
    allow?: string[];
    /** Disallowed paths. */
    disallow?: string[];
    /** URL of the sitemap. */
    sitemap?: string;
    /** Crawl delay in seconds. */
    crawlDelay?: number;
    /** User agent string (default "*"). */
    userAgent?: string;
  }

  /**
   * Generate a robots.txt string.
   */
  export function generateRobots(config?: RobotsConfig): string;

  // -------------------------------------------------------------------------
  // Open Graph Tags
  // -------------------------------------------------------------------------

  export interface OgTagsConfig {
    /** Page title (required). */
    title: string;
    /** Page description. */
    description?: string;
    /** Image URL. */
    image?: string;
    /** Canonical page URL. */
    url?: string;
    /** OG type (default "website"). */
    type?: string;
    /** Site name. */
    siteName?: string;
    /** Locale string. */
    locale?: string;
    /** Image width in pixels. */
    imageWidth?: number;
    /** Image height in pixels. */
    imageHeight?: number;
  }

  export interface MetaTag {
    property: string;
    content: string;
  }

  /**
   * Generate Open Graph meta tag descriptors.
   */
  export function ogTags(config: OgTagsConfig): MetaTag[];

  // -------------------------------------------------------------------------
  // Structured Data (JSON-LD)
  // -------------------------------------------------------------------------

  export interface ArticleConfig {
    headline: string;
    author?: string;
    datePublished?: string;
    dateModified?: string;
    image?: string;
    description?: string;
    publisher?: string;
  }

  export interface ProductConfig {
    name: string;
    price?: number;
    currency?: string;
    availability?: string;
    description?: string;
    image?: string;
    brand?: string;
    sku?: string;
  }

  export interface OrganizationConfig {
    name: string;
    url?: string;
    logo?: string;
    description?: string;
    sameAs?: string[];
  }

  export interface BreadcrumbItem {
    name: string;
    url: string;
  }

  export interface StructuredData {
    /** Article structured data (JSON-LD). */
    article(config: ArticleConfig): Record<string, any>;
    /** Product structured data (JSON-LD). */
    product(config: ProductConfig): Record<string, any>;
    /** Organization structured data (JSON-LD). */
    organization(config: OrganizationConfig): Record<string, any>;
    /** Breadcrumb structured data (JSON-LD). */
    breadcrumb(items: BreadcrumbItem[]): Record<string, any>;
  }

  export const structuredData: StructuredData;

  // -------------------------------------------------------------------------
  // Canonical URL
  // -------------------------------------------------------------------------

  export interface LinkTag {
    rel: string;
    href: string;
  }

  /**
   * Create a canonical URL link descriptor, stripping query params and fragments.
   */
  export function canonicalUrl(url: string): LinkTag;
}
