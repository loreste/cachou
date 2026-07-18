/**
 * Control-flow helpers (Show / Switch / For / Index / KeepAlive).
 * @module cachoujs/flow
 */
declare module "cachoujs/flow" {
  import type { Accessor, CachouChild, MaybeAccessor } from "cachoujs";

  export function Show<T>(props: {
    when: MaybeAccessor<T | false | null | undefined>;
    children?: CachouChild | ((value: NonNullable<T>) => CachouChild);
    fallback?: MaybeAccessor<CachouChild>;
  }): Accessor<CachouChild>;

  export function Switch(props: {
    children?: CachouChild | CachouChild[];
    fallback?: MaybeAccessor<CachouChild>;
  }): Accessor<CachouChild>;

  export function Match<T>(props: {
    when: MaybeAccessor<T | false | null | undefined>;
    children?: CachouChild | ((value: NonNullable<T>) => CachouChild);
  }): Accessor<null>;

  export function For<T>(props: {
    each: MaybeAccessor<readonly T[] | T[] | null | undefined>;
    children: (item: T, index: number) => CachouChild;
    by?: (item: T, index: number) => unknown;
    fallback?: MaybeAccessor<CachouChild>;
    uniqueKeys?: boolean;
  }): Accessor<CachouChild>;

  export function Index<T>(props: {
    each: MaybeAccessor<readonly T[] | T[] | null | undefined>;
    children: (item: Accessor<T | undefined>, index: number) => CachouChild;
    fallback?: MaybeAccessor<CachouChild>;
  }): Accessor<CachouChild>;

  export function KeepAlive(props: {
    max?: number;
    include?: string[];
    exclude?: string[];
    onActivate?: (key: string) => void;
    onDeactivate?: (key: string) => void;
    children?: MaybeAccessor<CachouChild>;
  }): HTMLElement | Accessor<CachouChild>;
}
