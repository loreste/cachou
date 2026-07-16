/**
 * Image optimization components for CachouJS.
 *
 * Provides `Image` and `Picture` components with lazy loading,
 * placeholder support, and responsive image handling.
 *
 * @module cachoujs/image
 */

import { html, htmlStatic } from "./html.js";
import { effect, onCleanup, emitFrameworkEvent } from "./reactivity.js";

/** @type {WeakMap<HTMLElement, IntersectionObserver>} */
const observerMap = new WeakMap();

/**
 * Default placeholder color used when `placeholder` is "color" and
 * no `placeholderColor` prop is provided.
 */
const DEFAULT_PLACEHOLDER_COLOR = "#e2e8f0";

/**
 * Resolve missing width or height from an aspect ratio string or number.
 * Accepts "16/9", "16:9", or a plain number (e.g. 1.777).
 *
 * @param {string|number|undefined} aspectRatio
 * @param {number|undefined} width
 * @param {number|undefined} height
 * @returns {{ width: number|undefined, height: number|undefined }}
 */
function resolveAspectRatio(aspectRatio, width, height) {
  if (aspectRatio == null) return { width, height };

  let ratio;
  if (typeof aspectRatio === "number") {
    ratio = aspectRatio;
  } else {
    const parts = String(aspectRatio).split(/[:/]/);
    if (parts.length === 2) {
      ratio = parseFloat(parts[0]) / parseFloat(parts[1]);
    } else {
      ratio = parseFloat(aspectRatio);
    }
  }

  if (!Number.isFinite(ratio) || ratio <= 0) return { width, height };

  if (width != null && height == null) {
    return { width, height: Math.round(width / ratio) };
  }
  if (height != null && width == null) {
    return { width: Math.round(height * ratio), height };
  }
  return { width, height };
}

/**
 * Set up an IntersectionObserver fallback for browsers without native
 * lazy loading.  When the image enters the viewport the real `src` is
 * applied from `data-src`.
 *
 * @param {HTMLImageElement} img
 */
function setupLazyFallback(img) {
  if (typeof IntersectionObserver === "undefined") return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const target = /** @type {HTMLImageElement} */ (entry.target);
          const realSrc = target.getAttribute("data-src");
          if (realSrc) {
            target.src = realSrc;
            target.removeAttribute("data-src");
          }
          const realSrcset = target.getAttribute("data-srcset");
          if (realSrcset) {
            target.srcset = realSrcset;
            target.removeAttribute("data-srcset");
          }
          observer.unobserve(target);
        }
      }
    },
    { rootMargin: "200px" }
  );

  observer.observe(img);
  observerMap.set(img, observer);
}

/**
 * Build inline placeholder styles for the container div.
 *
 * @param {string} placeholder - "blur" | "color" | "none"
 * @param {string} src
 * @param {string} placeholderColor
 * @returns {string}
 */
function placeholderStyle(placeholder, src, placeholderColor) {
  if (placeholder === "color") {
    return `background-color:${placeholderColor};`;
  }
  if (placeholder === "blur") {
    // Use a tiny version of the source (or the source itself) as a blurred
    // background while the full image loads.
    return `background-image:url(${src});background-size:cover;background-position:center;filter:blur(20px);`;
  }
  return "";
}

/**
 * `<img>` wrapper with lazy loading, placeholders,
 * responsive images, and accessibility enforcement.
 *
 * @param {object} props
 * @param {string} props.src                  - Image source (required).
 * @param {string} props.alt                  - Alt text (required for a11y).
 * @param {number} [props.width]              - Explicit width.
 * @param {number} [props.height]             - Explicit height.
 * @param {string} [props.loading="lazy"]     - Native loading attribute.
 * @param {string} [props.decoding="async"]   - Decoding hint.
 * @param {string} [props.sizes]              - Responsive sizes attribute.
 * @param {string} [props.srcset]             - Responsive source set.
 * @param {"blur"|"color"|"none"} [props.placeholder="none"] - Placeholder mode.
 * @param {string} [props.placeholderColor="#e2e8f0"] - Solid color for "color" placeholder.
 * @param {Function} [props.onLoad]           - Callback on image load.
 * @param {Function} [props.onError]          - Callback on image error.
 * @param {number} [props.quality]            - Build-time quality hint (1-100).
 * @param {boolean} [props.priority]          - When true, sets eager loading and fetchpriority="high".
 * @param {string|number} [props.aspectRatio] - Auto-calculate missing dimension.
 * @param {string} [props.fit="cover"]        - CSS object-fit value.
 * @param {string} [props.class]              - Additional CSS class.
 * @param {object} [props.style]              - Additional inline styles.
 * @returns {HTMLElement}
 */
export function Image(props) {
  if (typeof props.alt !== "string") {
    console.warn("[CachouJS Image]: `alt` prop is required for accessibility.");
  }

  const src = props.src;
  const alt = props.alt ?? "";
  const fit = props.fit || "cover";
  const placeholder = props.placeholder || "none";
  const phColor = props.placeholderColor || DEFAULT_PLACEHOLDER_COLOR;
  const priority = Boolean(props.priority);
  const loading = priority ? "eager" : (props.loading || "lazy");
  const decoding = props.decoding || "async";

  const dims = resolveAspectRatio(props.aspectRatio, props.width, props.height);
  const width = dims.width;
  const height = dims.height;

  // --- SSR path ---
  if (typeof window === "undefined" || typeof document === "undefined") {
    const attrs = [];
    attrs.push(`src="${src}"`);
    attrs.push(`alt="${alt}"`);
    if (width != null) attrs.push(`width="${width}"`);
    if (height != null) attrs.push(`height="${height}"`);
    attrs.push(`loading="${loading}"`);
    attrs.push(`decoding="${decoding}"`);
    if (props.srcset) attrs.push(`srcset="${props.srcset}"`);
    if (props.sizes) attrs.push(`sizes="${props.sizes}"`);
    if (priority) attrs.push(`fetchpriority="high"`);
    if (props.quality != null) attrs.push(`data-quality="${props.quality}"`);
    attrs.push(`style="object-fit:${fit};"`);

    const containerStyle = placeholder !== "none"
      ? ` style="position:relative;overflow:hidden;display:inline-block;${placeholderStyle(placeholder, src, phColor)}"`
      : "";

    return htmlStatic(
      `<div class="cachou-image${props.class ? " " + props.class : ""}"${containerStyle}><img ${attrs.join(" ")} /></div>`
    );
  }

  // --- Client path ---
  const container = document.createElement("div");
  container.className = "cachou-image" + (props.class ? " " + props.class : "");
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.display = "inline-block";

  if (placeholder === "color") {
    container.style.backgroundColor = phColor;
  } else if (placeholder === "blur") {
    container.style.backgroundImage = `url(${src})`;
    container.style.backgroundSize = "cover";
    container.style.backgroundPosition = "center";
    container.style.filter = "blur(20px)";
  }

  const img = document.createElement("img");
  img.alt = alt;
  img.style.objectFit = fit;
  img.loading = loading;
  img.decoding = decoding;

  if (width != null) {
    img.width = width;
  }
  if (height != null) {
    img.height = height;
  }
  if (props.sizes) {
    img.sizes = props.sizes;
  }
  if (priority) {
    img.setAttribute("fetchpriority", "high");
  }
  if (props.quality != null) {
    img.setAttribute("data-quality", String(props.quality));
  }

  // Handle load/error events
  img.addEventListener("load", () => {
    // Remove placeholder styling
    if (placeholder === "color") {
      container.style.backgroundColor = "";
    } else if (placeholder === "blur") {
      container.style.backgroundImage = "";
      container.style.filter = "";
    }
    emitFrameworkEvent({ type: "image:load", src });
    if (typeof props.onLoad === "function") {
      props.onLoad({ target: img, src });
    }
  });

  img.addEventListener("error", (e) => {
    emitFrameworkEvent({ type: "image:error", src, error: e });
    if (typeof props.onError === "function") {
      props.onError({ target: img, src, error: e });
    }
  });

  // Decide whether to use native lazy or IO fallback
  const supportsNativeLazy = "loading" in HTMLImageElement.prototype;
  if (loading === "lazy" && !supportsNativeLazy) {
    img.setAttribute("data-src", src);
    if (props.srcset) img.setAttribute("data-srcset", props.srcset);
    setupLazyFallback(img);
  } else {
    img.src = src;
    if (props.srcset) img.srcset = props.srcset;
  }

  container.appendChild(img);
  return container;
}

/**
 * `<picture>` element component with multiple `<source>` entries and
 * fallback to the `Image` component for the `<img>` tag.
 *
 * @param {object} props
 * @param {{ srcset: string, type?: string, media?: string, sizes?: string }[]} props.sources
 *   Array of source descriptors.
 * @param {string} props.src                  - Fallback image source.
 * @param {string} props.alt                  - Alt text (required).
 * @param {number} [props.width]
 * @param {number} [props.height]
 * @param {string} [props.loading="lazy"]
 * @param {string} [props.decoding="async"]
 * @param {"blur"|"color"|"none"} [props.placeholder="none"]
 * @param {string} [props.placeholderColor="#e2e8f0"]
 * @param {Function} [props.onLoad]
 * @param {Function} [props.onError]
 * @param {number} [props.quality]
 * @param {boolean} [props.priority]
 * @param {string|number} [props.aspectRatio]
 * @param {string} [props.fit="cover"]
 * @param {string} [props.class]
 * @returns {HTMLElement}
 */
export function Picture(props) {
  const sources = props.sources || [];
  const priority = Boolean(props.priority);
  const loading = priority ? "eager" : (props.loading || "lazy");
  const decoding = props.decoding || "async";
  const fit = props.fit || "cover";
  const placeholder = props.placeholder || "none";
  const phColor = props.placeholderColor || DEFAULT_PLACEHOLDER_COLOR;
  const alt = props.alt ?? "";

  const dims = resolveAspectRatio(props.aspectRatio, props.width, props.height);

  // --- SSR path ---
  if (typeof window === "undefined" || typeof document === "undefined") {
    let sourcesHTML = "";
    for (const s of sources) {
      const parts = [`srcset="${s.srcset}"`];
      if (s.type) parts.push(`type="${s.type}"`);
      if (s.media) parts.push(`media="${s.media}"`);
      if (s.sizes) parts.push(`sizes="${s.sizes}"`);
      sourcesHTML += `<source ${parts.join(" ")} />`;
    }

    const imgAttrs = [];
    imgAttrs.push(`src="${props.src}"`);
    imgAttrs.push(`alt="${alt}"`);
    if (dims.width != null) imgAttrs.push(`width="${dims.width}"`);
    if (dims.height != null) imgAttrs.push(`height="${dims.height}"`);
    imgAttrs.push(`loading="${loading}"`);
    imgAttrs.push(`decoding="${decoding}"`);
    if (priority) imgAttrs.push(`fetchpriority="high"`);
    if (props.quality != null) imgAttrs.push(`data-quality="${props.quality}"`);
    imgAttrs.push(`style="object-fit:${fit};"`);

    const containerStyle = placeholder !== "none"
      ? ` style="position:relative;overflow:hidden;display:inline-block;${placeholderStyle(placeholder, props.src, phColor)}"`
      : "";

    return htmlStatic(
      `<div class="cachou-image${props.class ? " " + props.class : ""}"${containerStyle}><picture>${sourcesHTML}<img ${imgAttrs.join(" ")} /></picture></div>`
    );
  }

  // --- Client path ---
  const container = document.createElement("div");
  container.className = "cachou-image" + (props.class ? " " + props.class : "");
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.display = "inline-block";

  if (placeholder === "color") {
    container.style.backgroundColor = phColor;
  } else if (placeholder === "blur") {
    container.style.backgroundImage = `url(${props.src})`;
    container.style.backgroundSize = "cover";
    container.style.backgroundPosition = "center";
    container.style.filter = "blur(20px)";
  }

  const picture = document.createElement("picture");

  for (const s of sources) {
    const source = document.createElement("source");
    source.srcset = s.srcset;
    if (s.type) source.type = s.type;
    if (s.media) source.media = s.media;
    if (s.sizes) source.sizes = s.sizes;
    picture.appendChild(source);
  }

  const img = document.createElement("img");
  img.alt = alt;
  img.style.objectFit = fit;
  img.loading = loading;
  img.decoding = decoding;

  if (dims.width != null) img.width = dims.width;
  if (dims.height != null) img.height = dims.height;
  if (props.sizes) img.sizes = props.sizes;
  if (priority) img.setAttribute("fetchpriority", "high");
  if (props.quality != null) img.setAttribute("data-quality", String(props.quality));

  img.addEventListener("load", () => {
    if (placeholder === "color") {
      container.style.backgroundColor = "";
    } else if (placeholder === "blur") {
      container.style.backgroundImage = "";
      container.style.filter = "";
    }
    emitFrameworkEvent({ type: "image:load", src: props.src });
    if (typeof props.onLoad === "function") {
      props.onLoad({ target: img, src: props.src });
    }
  });

  img.addEventListener("error", (e) => {
    emitFrameworkEvent({ type: "image:error", src: props.src, error: e });
    if (typeof props.onError === "function") {
      props.onError({ target: img, src: props.src, error: e });
    }
  });

  const supportsNativeLazy = "loading" in HTMLImageElement.prototype;
  if (loading === "lazy" && !supportsNativeLazy) {
    img.setAttribute("data-src", props.src);
    if (props.srcset) img.setAttribute("data-srcset", props.srcset);
    setupLazyFallback(img);
  } else {
    img.src = props.src;
    if (props.srcset) img.srcset = props.srcset;
  }

  picture.appendChild(img);
  container.appendChild(picture);
  return container;
}
