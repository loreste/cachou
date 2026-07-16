/**
 * Media components for CachouJS.
 *
 * Provides `Image`, `Picture`, and `Video` components with lazy loading,
 * placeholder support, responsive handling, and accessibility.
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

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

/**
 * Set up an IntersectionObserver to lazy-load a video when it enters the
 * viewport.  On intersection, sources are applied from `data-src` and
 * the video is loaded.
 *
 * @param {HTMLVideoElement} video
 * @param {Array<{src: string, type?: string}>} sources
 */
function setupVideoLazy(video, sources) {
  if (typeof IntersectionObserver === "undefined") {
    applySources(video, sources);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          applySources(/** @type {HTMLVideoElement} */ (entry.target), sources);
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "200px" }
  );

  observer.observe(video);
  observerMap.set(video, observer);
}

/**
 * Apply source elements to a video and trigger load.
 *
 * @param {HTMLVideoElement} video
 * @param {Array<{src: string, type?: string}>} sources
 */
function applySources(video, sources) {
  for (const s of sources) {
    const source = document.createElement("source");
    source.src = s.src;
    if (s.type) source.type = s.type;
    video.appendChild(source);
  }
  video.load();
}

/**
 * `<video>` component with lazy loading, poster/placeholder support,
 * multiple sources, and accessibility enforcement.
 *
 * @param {object} props
 * @param {string} [props.src]                   - Video source URL (single source shorthand).
 * @param {Array<{src: string, type?: string}>} [props.sources] - Multiple sources for format fallback.
 * @param {number} [props.width]                 - Explicit width (prevents CLS).
 * @param {number} [props.height]                - Explicit height.
 * @param {string|number} [props.aspectRatio]    - Auto-calculate missing dimension (e.g. "16/9").
 * @param {string} [props.poster]                - Poster image URL shown before playback.
 * @param {boolean} [props.autoplay=false]        - Autoplay (muted required for most browsers).
 * @param {boolean} [props.muted=false]           - Mute audio.
 * @param {boolean} [props.loop=false]            - Loop playback.
 * @param {boolean} [props.controls=true]         - Show native controls.
 * @param {boolean} [props.playsinline=false]     - Inline playback on mobile.
 * @param {boolean} [props.lazy=true]             - Defer loading until near viewport.
 * @param {boolean} [props.priority=false]        - Eager load, skip lazy.
 * @param {"auto"|"metadata"|"none"} [props.preload] - Preload hint. Defaults to "metadata", or "none" when lazy.
 * @param {string} [props.fit="contain"]          - CSS object-fit value.
 * @param {string} [props.class]                  - Additional CSS class.
 * @param {Function} [props.onPlay]               - Callback on play.
 * @param {Function} [props.onPause]              - Callback on pause.
 * @param {Function} [props.onEnded]              - Callback on ended.
 * @param {Function} [props.onError]              - Callback on error.
 * @param {Function} [props.onLoadedMetadata]     - Callback when metadata loads.
 * @param {string} [props.track]                  - Subtitles/captions track URL.
 * @param {string} [props.trackLang="en"]         - Track language code.
 * @param {string} [props.trackLabel]             - Track label for the UI.
 * @param {"subtitles"|"captions"|"descriptions"} [props.trackKind="subtitles"] - Track kind.
 * @returns {HTMLElement}
 *
 * @example
 * ```js
 * Video({
 *   src: "/hero.mp4",
 *   poster: "/hero-poster.jpg",
 *   width: 1280,
 *   aspectRatio: "16/9",
 *   autoplay: true,
 *   muted: true,
 *   loop: true,
 *   lazy: true
 * })
 * ```
 */
export function Video(props) {
  const priority = Boolean(props.priority);
  const lazy = priority ? false : (props.lazy !== false);
  const controls = props.controls !== false;
  const autoplay = Boolean(props.autoplay);
  const muted = Boolean(props.muted) || autoplay; // autoplay requires muted in most browsers
  const loop = Boolean(props.loop);
  const playsinline = Boolean(props.playsinline) || autoplay;
  const fit = props.fit || "contain";
  const preload = props.preload || (lazy ? "none" : "metadata");

  const dims = resolveAspectRatio(props.aspectRatio, props.width, props.height);

  // Build sources array from either props.sources or props.src
  const sources = props.sources || (props.src ? [{ src: props.src }] : []);

  if (sources.length === 0) {
    console.warn("[CachouJS Video]: no `src` or `sources` provided.");
  }

  // --- SSR path ---
  if (typeof window === "undefined" || typeof document === "undefined") {
    const attrs = [];
    if (dims.width != null) attrs.push(`width="${dims.width}"`);
    if (dims.height != null) attrs.push(`height="${dims.height}"`);
    if (props.poster) attrs.push(`poster="${props.poster}"`);
    if (controls) attrs.push("controls");
    if (autoplay) attrs.push("autoplay");
    if (muted) attrs.push("muted");
    if (loop) attrs.push("loop");
    if (playsinline) attrs.push("playsinline");
    attrs.push(`preload="${preload}"`);
    attrs.push(`style="object-fit:${fit};"`);

    let sourcesHTML = "";
    for (const s of sources) {
      sourcesHTML += `<source src="${s.src}"${s.type ? ` type="${s.type}"` : ""} />`;
    }

    let trackHTML = "";
    if (props.track) {
      const kind = props.trackKind || "subtitles";
      const lang = props.trackLang || "en";
      const label = props.trackLabel || lang;
      trackHTML = `<track kind="${kind}" src="${props.track}" srclang="${lang}" label="${label}" default />`;
    }

    return htmlStatic(
      `<div class="cachou-video${props.class ? " " + props.class : ""}" style="position:relative;display:inline-block;overflow:hidden;">` +
      `<video ${attrs.join(" ")}>${sourcesHTML}${trackHTML}</video></div>`
    );
  }

  // --- Client path ---
  const container = document.createElement("div");
  container.className = "cachou-video" + (props.class ? " " + props.class : "");
  container.style.position = "relative";
  container.style.display = "inline-block";
  container.style.overflow = "hidden";

  const video = document.createElement("video");
  video.style.objectFit = fit;

  if (dims.width != null) video.width = dims.width;
  if (dims.height != null) video.height = dims.height;
  if (props.poster) video.poster = props.poster;
  if (controls) video.controls = true;
  if (muted) video.muted = true;
  if (loop) video.loop = true;
  if (playsinline) video.setAttribute("playsinline", "");
  if (autoplay) video.autoplay = true;
  video.preload = preload;

  // Captions/subtitles track
  if (props.track) {
    const track = document.createElement("track");
    track.kind = props.trackKind || "subtitles";
    track.src = props.track;
    track.srclang = props.trackLang || "en";
    track.label = props.trackLabel || track.srclang;
    track.default = true;
    video.appendChild(track);
  }

  // Event handlers
  video.addEventListener("play", () => {
    emitFrameworkEvent({ type: "video:play", src: props.src });
    if (typeof props.onPlay === "function") props.onPlay({ target: video });
  });

  video.addEventListener("pause", () => {
    emitFrameworkEvent({ type: "video:pause", src: props.src });
    if (typeof props.onPause === "function") props.onPause({ target: video });
  });

  video.addEventListener("ended", () => {
    emitFrameworkEvent({ type: "video:ended", src: props.src });
    if (typeof props.onEnded === "function") props.onEnded({ target: video });
  });

  video.addEventListener("error", (e) => {
    emitFrameworkEvent({ type: "video:error", src: props.src, error: e });
    if (typeof props.onError === "function") props.onError({ target: video, error: e });
  });

  video.addEventListener("loadedmetadata", () => {
    emitFrameworkEvent({ type: "video:metadata", src: props.src, duration: video.duration });
    if (typeof props.onLoadedMetadata === "function") {
      props.onLoadedMetadata({ target: video, duration: video.duration });
    }
  });

  // Lazy loading via IntersectionObserver
  if (lazy && sources.length > 0) {
    setupVideoLazy(video, sources);
  } else {
    applySources(video, sources);
  }

  container.appendChild(video);
  return container;
}
