declare module "cachoujs/upload" {
  import type { SignalGetter } from "cachoujs";

  /** Configuration for `createUpload`. */
  export interface UploadConfig {
    /** Upload endpoint URL. */
    url: string;
    /** HTTP method (default `"POST"`). */
    method?: string;
    /** Extra request headers. */
    headers?: Record<string, string>;
    /** Maximum file size in bytes. */
    maxSize?: number;
    /** Accepted MIME types or extensions (e.g. `["image/*", ".pdf"]`). */
    accept?: string[];
    /** Allow multiple files (default `false`). */
    multiple?: boolean;
    /** Form field name for the file (default `"file"`). */
    fieldName?: string;
    /** Progress callback. */
    onProgress?: (percent: number, loaded: number, total: number) => void;
    /** Called when the upload completes successfully. */
    onComplete?: (response: any) => void;
    /** Called when the upload fails. */
    onError?: (error: Error) => void;
    /** Enable chunked upload (default `false`). */
    chunked?: boolean;
    /** Chunk size in bytes (default 1 MB). */
    chunkSize?: number;
    /** Called after each chunk is uploaded. */
    onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
  }

  /** Controller returned by `createUpload`. */
  export interface UploadController {
    /** Reactive getter for upload progress (0-100). */
    progress: SignalGetter<number>;
    /** Reactive getter: `true` while uploading. */
    uploading: SignalGetter<boolean>;
    /** Reactive getter for the currently selected files. */
    files: SignalGetter<File[]>;
    /** Reactive getter for the most recent error, or `null`. */
    error: SignalGetter<Error | null>;
    /** Open a native file picker and add selected files. */
    select(): void;
    /** Begin uploading the selected files. */
    start(): Promise<void>;
    /** Abort the in-flight upload. */
    abort(): void;
    /** Reset all upload state (aborts any in-flight upload). */
    reset(): void;
    /** Add files programmatically. Validates each file against config constraints. */
    addFiles(fileList: FileList | File[]): void;
  }

  /**
   * Create a file upload controller with reactive state and progress tracking.
   */
  export function createUpload(config: UploadConfig): UploadController;

  /** Props for the `DropZone` component. */
  export interface DropZoneProps {
    /** Linked upload instance. */
    upload: UploadController;
    /** CSS class for the drop zone element. */
    class?: string;
    /** Class added when dragging over (default `"drag-active"`). */
    activeClass?: string;
    /** Content inside the drop zone. */
    children?: (() => Node | string) | Node | string;
  }

  /**
   * Drop zone component for drag-and-drop file uploads.
   * Handles drag events, prevents default browser file opening, and shows
   * an active state during drag. Clicking triggers the file picker.
   */
  export function DropZone(props: DropZoneProps): HTMLElement | string;
}
