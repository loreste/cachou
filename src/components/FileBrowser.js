import { createFileBrowser, createFileContent } from "../files.js";
import { html } from "../html.js";
import { mapArray, memo, signal } from "../reactivity.js";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewableImage(file) {
  return file && file.kind === "binary" && file.mime && file.mime.startsWith("image/");
}

export function FileBrowser(props = {}) {
  const [directory, files] = createFileBrowser(props.initialPath || "", {
    includeHidden: props.includeHidden,
    key: props.key || "cachou-file-browser-component"
  });
  const [selectedPath, setSelectedPath] = signal("");
  const [file, fileControls] = createFileContent(selectedPath, {
    key: props.contentKey || "cachou-file-browser-content"
  });

  const breadcrumbs = memo(() => {
    const current = directory()?.path || "";
    const parts = current ? current.split("/") : [];
    const crumbs = [{ label: directory()?.root || "root", path: "" }];
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  });

  const openEntry = (entry) => {
    if (entry.type === "directory") {
      files.open(entry.path);
      setSelectedPath("");
    } else if (entry.type === "file") {
      setSelectedPath(entry.path);
      fileControls.refetch();
      if (typeof props.onSelect === "function") {
        props.onSelect(entry);
      }
    }
  };

  return html`
    <section class=${props.class || "cachou-file-browser"}>
      <header class="cachou-file-browser__header">
        <button type="button" onclick=${files.up} disabled=${() => !directory()?.parentPath}>Up</button>
        <nav class="cachou-file-browser__breadcrumbs">
          ${mapArray(breadcrumbs, crumb => html`
            <button type="button" onclick=${() => files.open(crumb.path)}>${crumb.label}</button>
          `, crumb => crumb.path)}
        </nav>
      </header>

      <div class="cachou-file-browser__body">
        <ul class="cachou-file-browser__list">
          ${() => files.loading() ? html`<li>Loading...</li>` : ""}
          ${() => files.error() ? html`<li>${files.error().message}</li>` : ""}
          ${mapArray(() => directory()?.entries || [], entry => html`
            <li>
              <button type="button" onclick=${() => openEntry(entry)}>
                <span>${entry.type === "directory" ? "dir" : "file"}</span>
                <span>${entry.name}</span>
                <small>${entry.type === "file" ? formatBytes(entry.size) : ""}</small>
              </button>
            </li>
          `, entry => entry.path)}
        </ul>

        <article class="cachou-file-browser__preview">
          ${() => fileControls.loading() ? html`<p>Loading file...</p>` : ""}
          ${() => fileControls.error() ? html`<p>${fileControls.error().message}</p>` : ""}
          ${() => {
            const current = file();
            if (!current) return html`<p>Select a file to preview.</p>`;
            if (current.kind === "text") {
              return html`<pre>${current.content}</pre>`;
            }
            if (isPreviewableImage(current)) {
              return html`<img alt=${current.name} src=${`data:${current.mime};base64,${current.content}`} />`;
            }
            return html`<p>Binary file (${current.mime}, ${formatBytes(current.size)})</p>`;
          }}
        </article>
      </div>
    </section>
  `;
}
