/**
 * Demo-oriented files helpers (fetch `/api/files` on the monorepo server).
 * @module cachoujs/files
 */
declare module "cachoujs/files" {
  import type { SignalGetter, SignalSetter } from "cachoujs";

  export interface FileEntry {
    name: string;
    path: string;
    type: "directory" | "file" | "other";
    size: number;
    mtimeMs: number;
    extension: string;
  }

  export interface FileDirectory {
    root: string;
    path: string;
    parentPath: string | null;
    entries: FileEntry[];
  }

  export interface FileContent {
    name: string;
    path: string;
    size: number;
    mtimeMs: number;
    mime: string;
    kind: "text" | "binary";
    content: string;
    encoding: "utf8" | "base64";
  }

  export function listFiles(
    path?: string,
    options?: { includeHidden?: boolean }
  ): Promise<FileDirectory>;

  export function readFile(path?: string): Promise<FileContent>;

  export function createFileBrowser(
    initialPath?: string,
    options?: {
      includeHidden?: boolean;
      key?: string;
      staleTime?: number;
      revalidateOnFocus?: boolean;
    }
  ): [
    SignalGetter<FileDirectory | undefined>,
    {
      loading: SignalGetter<boolean>;
      error: SignalGetter<any>;
      refetch: () => Promise<void>;
      mutate: (data: FileDirectory) => void;
      path: SignalGetter<string>;
      setPath: SignalSetter<string>;
      open: (path?: string) => Promise<void>;
      up: () => Promise<void>;
    }
  ];

  export function createFileContent(
    path: string | SignalGetter<string>,
    options?: {
      key?: string;
      staleTime?: number;
      revalidateOnFocus?: boolean;
    }
  ): [
    SignalGetter<FileContent | null | undefined>,
    {
      loading: SignalGetter<boolean>;
      error: SignalGetter<any>;
      refetch: () => Promise<void>;
      mutate: (data: FileContent | null) => void;
    }
  ];
}
