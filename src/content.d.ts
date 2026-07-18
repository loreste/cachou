/**
 * Content collections (Node-oriented, experimental).
 * @module cachoujs/content
 */
declare module "cachoujs/content" {
  export interface SchemaResult {
    valid: boolean;
    errors?: string[];
  }

  export interface Schema {
    validate(value: any): SchemaResult;
  }

  export const z: {
    string(): Schema;
    number(): Schema;
    boolean(): Schema;
    date(): Schema;
    array(item?: Schema): Schema;
    object(shape?: Record<string, Schema>): Schema;
    optional(inner: Schema): Schema;
    enum(values: readonly any[]): Schema;
  };

  export interface ContentEntry {
    slug: string;
    data: Record<string, any>;
    body?: string;
    rawContent?: string;
    _valid?: boolean;
    _errors?: string[];
  }

  export interface CollectionConfig {
    name: string;
    schema?: Schema | ((entry: any) => SchemaResult);
    directory?: string;
  }

  export interface Collection {
    name: string;
    schema: Schema | null;
    directory: string | null;
    entries: Map<string, any>;
  }

  export function defineCollection(config: CollectionConfig): Collection;

  export function getCollection(
    collection: string | { name: string }
  ): ContentEntry[];

  export function getEntry(
    collection: string | { name: string },
    slug: string
  ): ContentEntry | null;

  export function parseFrontmatter(content: string): {
    data: Record<string, any>;
    body: string;
  };

  export function loadContent(
    collectionConfigs: CollectionConfig[]
  ): Promise<void>;

  export function addEntries(
    collection: string | { name: string },
    entries: Array<{
      slug: string;
      data: any;
      body?: string;
      rawContent?: string;
    }>
  ): void;

  export function clearCollection(collection: string | { name: string }): void;

  export interface ContentManifest {
    version: 1;
    generatedAt: string;
    collections: Record<string, ContentEntry[]>;
  }

  export function exportContentManifest(
    names?: string | string[] | Array<{ name: string }> | null,
    options?: {
      includeBody?: boolean;
      includeRaw?: boolean;
      onlyValid?: boolean;
    }
  ): ContentManifest;

  export function writeContentManifest(
    outPath: string,
    manifest?: ContentManifest | null,
    options?: {
      pretty?: boolean;
      names?: string | string[] | null;
      includeBody?: boolean;
      includeRaw?: boolean;
      onlyValid?: boolean;
    }
  ): Promise<{ path: string; bytes: number; entryCount: number }>;

  export interface ContentRoute {
    path: string;
    title?: string;
    slug?: string;
    entry?: ContentEntry;
    collection?: string;
  }

  export function routesFromCollection(
    collection: string | { name: string },
    options?: {
      prefix?: string;
      path?: (entry: ContentEntry) => string;
      title?: (entry: ContentEntry) => string | undefined;
      onlyValid?: boolean;
      includeIndex?: boolean;
      indexPath?: string;
      indexTitle?: string;
    }
  ): ContentRoute[];

  export function buildContent(
    collectionConfigs: CollectionConfig[],
    options?: {
      outPath?: string;
      includeBody?: boolean;
      includeRaw?: boolean;
      onlyValid?: boolean;
      pretty?: boolean;
      routeCollections?: Array<
        | string
        | {
            name: string;
            prefix?: string;
            path?: (entry: ContentEntry) => string;
            title?: (entry: ContentEntry) => string | undefined;
            includeIndex?: boolean;
            indexPath?: string;
            indexTitle?: string;
            onlyValid?: boolean;
          }
      >;
    }
  ): Promise<{
    manifest: ContentManifest;
    written: { path: string; bytes: number; entryCount: number } | null;
    routes: ContentRoute[];
  }>;
}
