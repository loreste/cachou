# Image Optimization

Cachou provides `Image` and `Picture` components that handle lazy loading, placeholders, responsive images, and CLS prevention out of the box. They work on both client and server (SSR).

---

## Table of contents

1. [The `Image` component](#the-image-component)
2. [Placeholders](#placeholders)
3. [Priority images](#priority-images)
4. [Responsive images with `srcset`](#responsive-images-with-srcset)
5. [The `Picture` component](#the-picture-component)
6. [Aspect ratio and CLS prevention](#aspect-ratio-and-cls-prevention)
7. [Performance best practices](#performance-best-practices)

---

## The `Image` component

```javascript
import { Image } from "cachoujs";

function ProductCard({ product }) {
  return html`
    <div class="product-card">
      ${Image({
        src: product.image,
        alt: product.name,
        width: 400,
        height: 300,
        placeholder: "blur"
      })}
      <h3>${product.name}</h3>
    </div>
  `;
}
```

The `Image` component wraps a standard `<img>` in a container `<div class="cachou-image">` and adds:

- Native `loading="lazy"` by default, with IntersectionObserver fallback for older browsers
- `decoding="async"` by default
- Placeholder support (blur or solid color)
- Automatic width/height for CLS prevention
- Framework events on load/error (`image:load`, `image:error`)

### Props

| Prop | Default | Description |
|------|---------|-------------|
| `src` | — | Image URL (required) |
| `alt` | — | Alt text (required, warns if missing) |
| `width` | — | Image width |
| `height` | — | Image height |
| `loading` | `"lazy"` | `"lazy"` or `"eager"` |
| `decoding` | `"async"` | Decoding hint |
| `srcset` | — | Responsive source set |
| `sizes` | — | Responsive sizes attribute |
| `placeholder` | `"none"` | `"none"`, `"blur"`, or `"color"` |
| `placeholderColor` | `"#e2e8f0"` | Color for the `"color"` placeholder |
| `priority` | `false` | Sets eager loading + `fetchpriority="high"` |
| `aspectRatio` | — | e.g. `"16/9"` or `1.777` — auto-calculates missing dimension |
| `fit` | `"cover"` | CSS `object-fit` value |
| `quality` | — | Build-time quality hint (1-100), stored as `data-quality` |
| `class` | — | Extra CSS class on the container |
| `onLoad` | — | Callback: `({ target, src }) => void` |
| `onError` | — | Callback: `({ target, src, error }) => void` |

---

## Placeholders

Placeholders prevent the jarring flash of an empty space while images load.

### Color placeholder

Shows a solid background color until the image loads. Simple and zero-cost.

```javascript
Image({
  src: "/photos/hero.jpg",
  alt: "Hero image",
  width: 1200,
  height: 600,
  placeholder: "color",
  placeholderColor: "#1e293b"
});
```

### Blur placeholder

Uses the image URL itself as a blurred background. The browser loads a version of the image (or ideally a tiny thumbnail URL you provide), blurs it with CSS, and then clears the blur when the full image loads.

```javascript
Image({
  src: "/photos/hero.jpg",
  alt: "Hero image",
  width: 1200,
  height: 600,
  placeholder: "blur"
});
```

For best results with blur placeholders, serve a tiny (20-40px wide) version of the image at a different URL and use that as `src` in a separate hidden element, or generate base64 thumbnails at build time. The current implementation uses the full `src` for the blur background, which works but means the browser loads the image twice (once for background, once for the `<img>`). A build plugin can optimize this.

---

## Priority images

For above-the-fold images (hero images, LCP candidates), set `priority` to skip lazy loading and tell the browser to fetch them first.

```javascript
Image({
  src: "/hero.jpg",
  alt: "Welcome to our app",
  width: 1200,
  height: 600,
  priority: true  // sets loading="eager" + fetchpriority="high"
});
```

Only mark 1-2 images per page as priority. If everything is priority, nothing is.

---

## Responsive images with `srcset`

Pass `srcset` and `sizes` to serve different image sizes based on viewport width.

```javascript
Image({
  src: "/photos/hero-800.jpg",
  alt: "Hero",
  width: 800,
  height: 400,
  srcset: "/photos/hero-400.jpg 400w, /photos/hero-800.jpg 800w, /photos/hero-1200.jpg 1200w",
  sizes: "(max-width: 600px) 400px, (max-width: 1000px) 800px, 1200px"
});
```

When native `loading="lazy"` isn't supported, the component falls back to IntersectionObserver. In that case, `src` and `srcset` are stored as `data-src` and `data-srcset` until the image enters the viewport.

---

## The `Picture` component

`Picture` renders a `<picture>` element with multiple `<source>` entries for art direction — serving different image crops or formats based on media queries.

```javascript
import { Picture } from "cachoujs";

Picture({
  sources: [
    { srcset: "/hero-mobile.webp", type: "image/webp", media: "(max-width: 768px)" },
    { srcset: "/hero-desktop.webp", type: "image/webp" },
    { srcset: "/hero-desktop.jpg", type: "image/jpeg" }
  ],
  src: "/hero-desktop.jpg",  // fallback
  alt: "Product showcase",
  width: 1200,
  height: 600,
  placeholder: "color",
  placeholderColor: "#f1f5f9"
});
```

### Source properties

Each source object supports:

| Property | Description |
|----------|-------------|
| `srcset` | Required — the source set |
| `type` | MIME type (e.g. `"image/webp"`, `"image/avif"`) |
| `media` | Media query for art direction |
| `sizes` | Sizes attribute for this source |

`Picture` accepts all the same props as `Image` for the fallback `<img>` (alt, width, height, placeholder, priority, etc.).

### When to use Picture vs. Image

- **Image with `srcset`**: Same image at different resolutions. The browser picks the best size.
- **Picture with `sources`**: Different images for different conditions. You control which image shows on mobile vs. desktop, or serve WebP/AVIF with JPEG fallback.

---

## Aspect ratio and CLS prevention

Cumulative Layout Shift (CLS) happens when images load without reserved space, pushing content around. The fix: always provide `width` and `height`, or use `aspectRatio`.

```javascript
// Explicit dimensions
Image({ src: "/photo.jpg", alt: "Photo", width: 800, height: 600 });

// Or use aspect ratio to calculate the missing dimension
Image({ src: "/photo.jpg", alt: "Photo", width: 800, aspectRatio: "4/3" });
// height is auto-calculated to 600

Image({ src: "/photo.jpg", alt: "Photo", height: 400, aspectRatio: "16/9" });
// width is auto-calculated to 711
```

Aspect ratio accepts:
- Fraction strings: `"16/9"`, `"4/3"`, `"1/1"`
- Colon notation: `"16:9"`
- Plain numbers: `1.777`

---

## Performance best practices

**Always set width and height.** Even if you're using responsive images, the explicit dimensions let the browser calculate the aspect ratio before the image loads. This is the single biggest thing you can do for CLS.

**Use `priority` for your LCP image.** That's usually the hero image or the first product image. One per page, maybe two.

**Prefer `loading="lazy"` for everything else.** This is the default. Below-the-fold images load when the user scrolls near them.

**Serve modern formats.** Use `Picture` to offer WebP or AVIF with a JPEG/PNG fallback. Modern formats are 25-50% smaller at the same quality.

```javascript
Picture({
  sources: [
    { srcset: "/product.avif", type: "image/avif" },
    { srcset: "/product.webp", type: "image/webp" }
  ],
  src: "/product.jpg",
  alt: "Product",
  width: 600,
  height: 400
});
```

**Use the `quality` prop as a build-time hint.** Cachou stores it as `data-quality` on the `<img>` tag. A build plugin or image CDN can read this attribute to generate optimized versions.

**Don't forget alt text.** The component warns you if `alt` is missing, but it won't block rendering. Screen readers need it. Search engines use it. Write something descriptive.

---

## Next steps

- [Styling](./STYLING.md) — scoped CSS and themes
- [API reference](./API.md) — `Image` and `Picture` signatures
- [Performance practices](./GUIDE.md#19-performance-practices) — general framework performance tips
