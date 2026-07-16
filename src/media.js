/**
 * Media processing utilities for CachouJS.
 *
 * Server-side utilities for image compression, resizing, video transcoding,
 * thumbnail generation, and format conversion. These run at build time or
 * on the server — they're not shipped to the browser.
 *
 * @module cachoujs/media
 */

// ---------------------------------------------------------------------------
// Image processing
// ---------------------------------------------------------------------------

/**
 * Compress and optionally resize an image using sharp (if available) or
 * canvas fallback.
 *
 * @param {Buffer|string} input - Image buffer or file path.
 * @param {object} [options]
 * @param {number} [options.quality=80]       - Output quality (1-100).
 * @param {number} [options.width]            - Resize to this width (preserves aspect ratio).
 * @param {number} [options.height]           - Resize to this height.
 * @param {"webp"|"avif"|"jpeg"|"png"} [options.format] - Output format. Defaults to input format.
 * @param {boolean} [options.progressive=true] - Progressive JPEG/PNG.
 * @param {string} [options.output]           - Output file path. If omitted, returns a Buffer.
 * @returns {Promise<{ buffer: Buffer, width: number, height: number, format: string, size: number }>}
 */
export async function compressImage(input, options = {}) {
  const sharp = await loadSharp();
  const quality = options.quality ?? 80;
  const format = options.format || null;

  let pipeline = sharp(typeof input === "string" ? input : Buffer.from(input));

  if (options.width || options.height) {
    pipeline = pipeline.resize(options.width || null, options.height || null, {
      fit: "inside",
      withoutEnlargement: true
    });
  }

  if (format === "webp") {
    pipeline = pipeline.webp({ quality });
  } else if (format === "avif") {
    pipeline = pipeline.avif({ quality });
  } else if (format === "jpeg" || format === "jpg") {
    pipeline = pipeline.jpeg({ quality, progressive: options.progressive !== false });
  } else if (format === "png") {
    pipeline = pipeline.png({ progressive: options.progressive !== false });
  } else {
    // Auto-detect — apply quality to whatever format it is
    const meta = await sharp(typeof input === "string" ? input : Buffer.from(input)).metadata();
    const detected = meta.format;
    if (detected === "jpeg") {
      pipeline = pipeline.jpeg({ quality, progressive: options.progressive !== false });
    } else if (detected === "png") {
      pipeline = pipeline.png({ progressive: options.progressive !== false });
    } else if (detected === "webp") {
      pipeline = pipeline.webp({ quality });
    }
  }

  const buffer = await pipeline.toBuffer({ resolveWithObject: true });

  if (options.output) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(options.output, buffer.data);
  }

  return {
    buffer: buffer.data,
    width: buffer.info.width,
    height: buffer.info.height,
    format: buffer.info.format,
    size: buffer.data.length
  };
}

/**
 * Generate a responsive image set — multiple sizes of the same image.
 *
 * @param {Buffer|string} input - Image buffer or file path.
 * @param {object} [options]
 * @param {number[]} [options.widths=[320, 640, 960, 1280, 1920]] - Target widths.
 * @param {"webp"|"avif"|"jpeg"|"png"} [options.format="webp"] - Output format.
 * @param {number} [options.quality=80] - Output quality.
 * @param {string} [options.outputDir] - Directory to write files to.
 * @param {string} [options.namePrefix="img"] - File name prefix.
 * @returns {Promise<Array<{ width: number, height: number, size: number, path?: string, buffer: Buffer }>>}
 */
export async function generateSrcSet(input, options = {}) {
  const widths = options.widths || [320, 640, 960, 1280, 1920];
  const format = options.format || "webp";
  const quality = options.quality ?? 80;
  const prefix = options.namePrefix || "img";
  const results = [];

  for (const w of widths) {
    const result = await compressImage(input, {
      width: w,
      quality,
      format
    });

    let filePath;
    if (options.outputDir) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      await fs.mkdir(options.outputDir, { recursive: true });
      filePath = path.join(options.outputDir, `${prefix}-${w}w.${format}`);
      await fs.writeFile(filePath, result.buffer);
    }

    results.push({
      width: result.width,
      height: result.height,
      size: result.size,
      path: filePath,
      buffer: result.buffer
    });
  }

  return results;
}

/**
 * Generate a blur placeholder — a tiny base64-encoded image for use as a
 * CSS background while the full image loads.
 *
 * @param {Buffer|string} input - Image buffer or file path.
 * @param {object} [options]
 * @param {number} [options.size=16] - Placeholder width in pixels.
 * @returns {Promise<{ base64: string, css: string, width: number, height: number }>}
 */
export async function blurPlaceholder(input, options = {}) {
  const sharp = await loadSharp();
  const size = options.size || 16;

  const pipeline = sharp(typeof input === "string" ? input : Buffer.from(input))
    .resize(size, null, { fit: "inside" })
    .blur(2)
    .jpeg({ quality: 20 });

  const buffer = await pipeline.toBuffer({ resolveWithObject: true });
  const base64 = `data:image/jpeg;base64,${buffer.data.toString("base64")}`;

  return {
    base64,
    css: `background-image:url(${base64});background-size:cover;filter:blur(20px);`,
    width: buffer.info.width,
    height: buffer.info.height
  };
}

// ---------------------------------------------------------------------------
// Video processing
// ---------------------------------------------------------------------------

/**
 * Compress/transcode a video using ffmpeg (must be installed on the system).
 *
 * @param {string} input - Input file path.
 * @param {string} output - Output file path.
 * @param {object} [options]
 * @param {"h264"|"h265"|"vp9"|"av1"} [options.codec="h264"] - Video codec.
 * @param {number} [options.crf=28]           - Constant rate factor (lower = higher quality, bigger file).
 * @param {number} [options.width]            - Scale to width (preserves aspect ratio).
 * @param {number} [options.height]           - Scale to height.
 * @param {number} [options.fps]              - Target framerate.
 * @param {boolean} [options.audio=true]      - Include audio track.
 * @param {"aac"|"opus"|"none"} [options.audioCodec="aac"] - Audio codec.
 * @param {number} [options.audioBitrate=128] - Audio bitrate in kbps.
 * @param {number} [options.maxDuration]      - Trim to max seconds.
 * @param {boolean} [options.fastStart=true]  - Move moov atom for streaming (mp4).
 * @returns {Promise<{ outputPath: string, duration: number|null, size: number }>}
 */
export async function compressVideo(input, output, options = {}) {
  const { exec } = await import("node:child_process");
  const fs = await import("node:fs/promises");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const codec = options.codec || "h264";
  const crf = options.crf ?? 28;
  const includeAudio = options.audio !== false;
  const audioCodec = options.audioCodec || "aac";
  const audioBitrate = options.audioBitrate || 128;
  const fastStart = options.fastStart !== false;

  const codecMap = {
    h264: "libx264",
    h265: "libx265",
    vp9: "libvpx-vp9",
    av1: "libaom-av1"
  };

  const args = ["ffmpeg", "-y", "-i", quote(input)];

  // Video codec
  args.push("-c:v", codecMap[codec] || "libx264");
  args.push("-crf", String(crf));

  // Scaling
  if (options.width || options.height) {
    const w = options.width || -2;
    const h = options.height || -2;
    args.push("-vf", `scale=${w}:${h}`);
  }

  // Framerate
  if (options.fps) {
    args.push("-r", String(options.fps));
  }

  // Audio
  if (!includeAudio || audioCodec === "none") {
    args.push("-an");
  } else {
    args.push("-c:a", audioCodec, "-b:a", `${audioBitrate}k`);
  }

  // Duration limit
  if (options.maxDuration) {
    args.push("-t", String(options.maxDuration));
  }

  // Fast start for mp4 streaming
  if (fastStart && output.endsWith(".mp4")) {
    args.push("-movflags", "+faststart");
  }

  args.push(quote(output));

  await execAsync(args.join(" "));

  const stat = await fs.stat(output);
  const duration = await getVideoDuration(output);

  return {
    outputPath: output,
    duration,
    size: stat.size
  };
}

/**
 * Generate a poster image (thumbnail) from a video.
 *
 * @param {string} input - Video file path.
 * @param {string} output - Output image path (e.g. "poster.jpg").
 * @param {object} [options]
 * @param {number} [options.timestamp=1]  - Grab frame at this second.
 * @param {number} [options.width]        - Scale to width.
 * @param {number} [options.quality=85]   - JPEG quality.
 * @returns {Promise<{ outputPath: string, size: number }>}
 */
export async function videoPoster(input, output, options = {}) {
  const { exec } = await import("node:child_process");
  const fs = await import("node:fs/promises");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const timestamp = options.timestamp ?? 1;
  const quality = options.quality ?? 85;

  const args = [
    "ffmpeg", "-y",
    "-ss", String(timestamp),
    "-i", quote(input),
    "-vframes", "1",
    "-q:v", String(Math.round((100 - quality) / 3.33 + 1))
  ];

  if (options.width) {
    args.push("-vf", `scale=${options.width}:-2`);
  }

  args.push(quote(output));
  await execAsync(args.join(" "));

  const stat = await fs.stat(output);
  return { outputPath: output, size: stat.size };
}

/**
 * Generate multiple video formats for browser compatibility.
 *
 * @param {string} input - Source video file path.
 * @param {object} [options]
 * @param {string} [options.outputDir] - Directory for output files.
 * @param {string} [options.namePrefix="video"] - File name prefix.
 * @param {Array<{format: string, codec: string, ext: string}>} [options.formats] - Format list.
 * @param {number} [options.crf=28] - Quality.
 * @param {number} [options.width] - Scale width.
 * @returns {Promise<Array<{ format: string, path: string, size: number, type: string }>>}
 */
export async function generateVideoFormats(input, options = {}) {
  const path = await import("node:path");
  const fs = await import("node:fs/promises");

  const outputDir = options.outputDir || path.dirname(input);
  const prefix = options.namePrefix || "video";
  const crf = options.crf ?? 28;

  const formats = options.formats || [
    { format: "mp4", codec: "h264", ext: "mp4" },
    { format: "webm", codec: "vp9", ext: "webm" }
  ];

  await fs.mkdir(outputDir, { recursive: true });

  const results = [];

  for (const fmt of formats) {
    const outputPath = path.join(outputDir, `${prefix}.${fmt.ext}`);
    const result = await compressVideo(input, outputPath, {
      codec: fmt.codec,
      crf,
      width: options.width
    });

    const mimeMap = {
      mp4: "video/mp4",
      webm: "video/webm",
      ogg: "video/ogg"
    };

    results.push({
      format: fmt.format,
      path: result.outputPath,
      size: result.size,
      type: mimeMap[fmt.ext] || `video/${fmt.ext}`
    });
  }

  return results;
}

/**
 * Get video duration in seconds using ffprobe.
 *
 * @param {string} filePath
 * @returns {Promise<number|null>}
 */
async function getVideoDuration(filePath) {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${quote(filePath)}`
    );
    const seconds = parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shell-safe quoting. */
function quote(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Dynamically load sharp without a static import specifier so browser bundlers
 * (Vite/Rolldown) do not try to resolve the optional Node-only dependency.
 */
async function loadSharp() {
  try {
    // Variable specifier + Function form both avoid static analysis.
    const specifier = "sharp";
    const dynamicImport = new Function("s", "return import(s)");
    const mod = await dynamicImport(specifier);
    return mod.default || mod;
  } catch {
    throw new Error(
      "[CachouJS Media]: `sharp` is required for image processing. Install it: npm install sharp"
    );
  }
}
