/**
 * Content collections (Node-oriented, experimental).
 * @module cachoujs/content
 */
declare module "cachoujs/content" {
  export const z: {
    string(): { validate(value: any): { valid: boolean; errors?: string[] } };
    number(): { validate(value: any): { valid: boolean; errors?: string[] } };
    boolean(): { validate(value: any): { valid: boolean; errors?: string[] } };
    array(item?: any): { validate(value: any): { valid: boolean; errors?: string[] } };
    object(shape?: Record<string, any>): {
      validate(value: any): { valid: boolean; errors?: string[] };
    };
    optional(inner: any): {
      validate(value: any): { valid: boolean; errors?: string[] };
    };
    [key: string]: any;
  };

  export function defineCollection(config: {
    name: string;
    schema?: any;
    [key: string]: any;
  }): any;
  export function getCollection(collection: string | any): any[];
  export function getEntry(collection: string | any, slug: string): any;
  export function parseFrontmatter(content: string): {
    data: Record<string, any>;
    body: string;
  };
  export function loadContent(collectionConfigs: any[]): Promise<any>;
  export function addEntries(collection: string | any, entries: any[]): void;
  export function clearCollection(collection: string | any): void;
}
