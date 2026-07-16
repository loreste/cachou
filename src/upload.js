/**
 * File upload utilities for CachouJS with progress tracking, drag-drop,
 * and chunked upload support.
 *
 * @module cachoujs/upload
 */

import { signal, effect, onCleanup, batch } from "./reactivity.js";

const IS_SSR = typeof window === "undefined" || typeof document === "undefined";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a file matches an accept pattern entry.
 * Supports MIME wildcards ("image/*") and extensions (".pdf").
 *
 * @param {File} file
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesAccept(file, pattern) {
  const p = pattern.trim();
  if (p.startsWith(".")) {
    return file.name.toLowerCase().endsWith(p.toLowerCase());
  }
  if (p.endsWith("/*")) {
    const prefix = p.slice(0, -1); // "image/"
    return file.type.startsWith(prefix);
  }
  return file.type === p;
}

/**
 * Validate a file against size and type constraints.
 *
 * @param {File} file
 * @param {{ maxSize?: number, accept?: string[] }} opts
 * @returns {string|null} Error message or null if valid.
 */
function validateFile(file, opts) {
  if (opts.maxSize && file.size > opts.maxSize) {
    const mb = (opts.maxSize / (1024 * 1024)).toFixed(1);
    return `File "${file.name}" exceeds maximum size of ${mb} MB`;
  }
  if (opts.accept && opts.accept.length > 0) {
    const ok = opts.accept.some((pat) => matchesAccept(file, pat));
    if (!ok) return `File "${file.name}" is not an accepted file type`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// createUpload
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} UploadConfig
 * @property {string} url - Upload endpoint URL.
 * @property {string} [method="POST"] - HTTP method.
 * @property {Record<string, string>} [headers] - Extra request headers.
 * @property {number} [maxSize] - Maximum file size in bytes.
 * @property {string[]} [accept] - Accepted MIME types or extensions.
 * @property {boolean} [multiple=false] - Allow multiple files.
 * @property {string} [fieldName="file"] - Form field name for the file.
 * @property {(percent: number, loaded: number, total: number) => void} [onProgress]
 * @property {(response: any) => void} [onComplete]
 * @property {(error: Error) => void} [onError]
 * @property {boolean} [chunked=false] - Enable chunked upload.
 * @property {number} [chunkSize=1048576] - Chunk size in bytes (default 1 MB).
 * @property {(chunkIndex: number, totalChunks: number) => void} [onChunkComplete]
 */

/**
 * Create a file upload controller with reactive state and progress tracking.
 *
 * @param {UploadConfig} config
 * @returns {Object} Upload controller.
 *
 * @example
 * const upload = createUpload({
 *   url: "/api/upload",
 *   maxSize: 10 * 1024 * 1024,
 *   accept: ["image/*", ".pdf"],
 *   multiple: true,
 *   onProgress: (pct) => console.log(pct + "%"),
 *   onComplete: (res) => console.log("Done", res)
 * });
 */
export function createUpload(config) {
  const [progress, setProgress] = signal(0);
  const [uploading, setUploading] = signal(false);
  const [files, setFiles] = signal(/** @type {File[]} */ ([]));
  const [error, setError] = signal(/** @type {Error|null} */ (null));

  /** @type {XMLHttpRequest|null} */
  let activeXhr = null;
  /** @type {boolean} */
  let aborted = false;

  const method = config.method || "POST";
  const fieldName = config.fieldName || "file";
  const chunkSize = config.chunkSize || 1024 * 1024;

  /**
   * Open a native file picker and add selected files.
   */
  function select() {
    if (IS_SSR) return;
    const input = document.createElement("input");
    input.type = "file";
    if (config.multiple) input.multiple = true;
    if (config.accept && config.accept.length > 0) {
      input.accept = config.accept.join(",");
    }
    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        addFiles(input.files);
      }
    };
    input.click();
  }

  /**
   * Add files programmatically. Validates each file and sets error on failure.
   *
   * @param {FileList|File[]} fileList
   */
  function addFiles(fileList) {
    const incoming = Array.from(fileList);
    for (const file of incoming) {
      const err = validateFile(file, config);
      if (err) {
        const e = new Error(err);
        setError(e);
        if (config.onError) config.onError(e);
        return;
      }
    }
    if (config.multiple) {
      setFiles((prev) => [...prev, ...incoming]);
    } else {
      setFiles(incoming.slice(0, 1));
    }
    setError(null);
  }

  /**
   * Begin uploading the selected files.
   * Uses chunked mode if `config.chunked` is true.
   *
   * @returns {Promise<void>}
   */
  async function start() {
    if (IS_SSR) return;
    const currentFiles = files();
    if (currentFiles.length === 0) return;

    aborted = false;
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      if (config.chunked) {
        await uploadChunked(currentFiles);
      } else {
        await uploadStandard(currentFiles);
      }
    } catch (err) {
      if (!aborted) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        if (config.onError) config.onError(e);
      }
    } finally {
      activeXhr = null;
      if (!aborted) {
        setUploading(false);
      }
    }
  }

  /**
   * Standard (non-chunked) upload via XHR.
   * @param {File[]} fileList
   * @returns {Promise<void>}
   */
  function uploadStandard(fileList) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhr = xhr;

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setProgress(pct);
          if (config.onProgress) config.onProgress(pct, e.loaded, e.total);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(100);
          let response;
          try {
            response = JSON.parse(xhr.responseText);
          } catch (_) {
            response = xhr.responseText;
          }
          if (config.onComplete) config.onComplete(response);
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Upload network error")));
      xhr.addEventListener("abort", () => {
        aborted = true;
        resolve();
      });

      xhr.open(method, config.url);

      if (config.headers) {
        for (const [key, val] of Object.entries(config.headers)) {
          xhr.setRequestHeader(key, val);
        }
      }

      const form = new FormData();
      for (const file of fileList) {
        form.append(fieldName, file, file.name);
      }
      xhr.send(form);
    });
  }

  /**
   * Chunked upload — splits each file into fixed-size chunks and sends
   * them sequentially with chunk metadata headers.
   *
   * @param {File[]} fileList
   * @returns {Promise<void>}
   */
  async function uploadChunked(fileList) {
    let totalSize = 0;
    for (const f of fileList) totalSize += f.size;
    let uploaded = 0;

    for (const file of fileList) {
      const totalChunks = Math.ceil(file.size / chunkSize);
      for (let i = 0; i < totalChunks; i++) {
        if (aborted) return;
        const blobStart = i * chunkSize;
        const blobEnd = Math.min(blobStart + chunkSize, file.size);
        const chunk = file.slice(blobStart, blobEnd);

        await sendChunk(chunk, file.name, i, totalChunks);
        uploaded += (blobEnd - blobStart);
        const pct = Math.round((uploaded / totalSize) * 100);
        setProgress(pct);
        if (config.onProgress) config.onProgress(pct, uploaded, totalSize);
        if (config.onChunkComplete) config.onChunkComplete(i, totalChunks);
      }
    }

    setProgress(100);
    if (config.onComplete) config.onComplete(null);
  }

  /**
   * Send a single chunk via XHR.
   *
   * @param {Blob} chunk
   * @param {string} fileName
   * @param {number} chunkIndex
   * @param {number} totalChunks
   * @returns {Promise<void>}
   */
  function sendChunk(chunk, fileName, chunkIndex, totalChunks) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhr = xhr;

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Chunk upload failed with status ${xhr.status}`));
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Chunk upload network error")));
      xhr.addEventListener("abort", () => {
        aborted = true;
        resolve();
      });

      xhr.open(method, config.url);

      // Chunk metadata headers
      xhr.setRequestHeader("X-Chunk-Index", String(chunkIndex));
      xhr.setRequestHeader("X-Total-Chunks", String(totalChunks));
      xhr.setRequestHeader("X-File-Name", fileName);

      if (config.headers) {
        for (const [key, val] of Object.entries(config.headers)) {
          xhr.setRequestHeader(key, val);
        }
      }

      const form = new FormData();
      form.append(fieldName, chunk, fileName);
      xhr.send(form);
    });
  }

  /**
   * Abort the in-flight upload.
   */
  function abort() {
    aborted = true;
    if (activeXhr) {
      activeXhr.abort();
      activeXhr = null;
    }
    batch(() => {
      setUploading(false);
      setProgress(0);
    });
  }

  /**
   * Reset all upload state.
   */
  function reset() {
    abort();
    batch(() => {
      setFiles([]);
      setError(null);
      setProgress(0);
      setUploading(false);
    });
    aborted = false;
  }

  return {
    progress,
    uploading,
    files,
    error,
    select,
    start,
    abort,
    reset,
    addFiles
  };
}

// ---------------------------------------------------------------------------
// DropZone component
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} DropZoneProps
 * @property {ReturnType<typeof createUpload>} upload - Linked upload instance.
 * @property {string} [class] - CSS class for the drop zone element.
 * @property {string} [activeClass="drag-active"] - Class added when dragging over.
 * @property {() => Node|string} [children] - Content inside the drop zone.
 */

/**
 * Drop zone component for drag-and-drop file uploads.
 *
 * Handles dragenter/dragover/dragleave/drop events, prevents default browser
 * file opening, and shows an active state during drag. Clicking triggers the
 * file picker. Accessible via role="button", tabindex, and keyboard activation.
 *
 * @param {DropZoneProps} props
 * @returns {HTMLElement|string}
 *
 * @example
 * DropZone({
 *   upload,
 *   class: "my-dropzone",
 *   children: () => html`<p>Drop files here</p>`,
 *   activeClass: "drag-active"
 * })
 */
export function DropZone(props) {
  if (IS_SSR) {
    // Return a placeholder for SSR
    return typeof props.children === "function" ? props.children() : (props.children || "");
  }

  const upload = props.upload;
  const activeClass = props.activeClass || "drag-active";
  const el = document.createElement("div");

  if (props.class) el.className = props.class;
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", "Drop zone: click or drop files to upload");

  // Track drag enter/leave depth for nested elements
  let dragDepth = 0;

  const onDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth++;
    if (dragDepth === 1) {
      el.classList.add(activeClass);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      el.classList.remove(activeClass);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    el.classList.remove(activeClass);
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      upload.addFiles(e.dataTransfer.files);
    }
  };

  const onClick = () => {
    upload.select();
  };

  const onKeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      upload.select();
    }
  };

  el.addEventListener("dragenter", onDragEnter);
  el.addEventListener("dragover", onDragOver);
  el.addEventListener("dragleave", onDragLeave);
  el.addEventListener("drop", onDrop);
  el.addEventListener("click", onClick);
  el.addEventListener("keydown", onKeydown);

  // Render children
  if (props.children) {
    const content = typeof props.children === "function" ? props.children() : props.children;
    if (content instanceof Node) {
      el.appendChild(content);
    } else if (content != null && content !== false) {
      el.appendChild(document.createTextNode(String(content)));
    }
  }

  // Cleanup on removal via onCleanup (if in a reactive owner)
  try {
    onCleanup(() => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKeydown);
    });
  } catch (_) {
    // Not inside a reactive context — cleanup will happen on DOM removal
  }

  return el;
}
