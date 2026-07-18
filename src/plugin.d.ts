/**
 * App / plugin system (experimental).
 * @module cachoujs/plugin
 */
declare module "cachoujs/plugin" {
  export interface App {
    plug(plugin: any): App;
    provide(key: string | symbol, value: any): App;
    component(name: string, component: any): App;
    directive(name: string, handler: any): App;
    mount(target: string | HTMLElement): () => void;
    unmount(): void;
    config: Record<string, any>;
  }

  export function launch(rootComponent: any, rootProps?: object): App;
  export function createApp(rootComponent: any, rootProps?: object): App;
  export function getApp(): App | null;
  /** @deprecated Use getApp() */
  export function useApp(): App | null;
}
