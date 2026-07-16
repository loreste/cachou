/**
 * Media processing utilities for Cachou.
 *
 * Server-side utilities for image compression, resizing, video transcoding,
 * thumbnail generation, and format conversion.
 *
 * @module cachoujs/media
 */
declare module "cachoujs/media" {
  // -------------------------------------------------------------------------
  // Image Processing
  // -------------------------------------------------------------------------

  export interface CompressImageOptions {
    /** Output quality (1-100, default 80). */
    quality?: number;
    /** Resize to this width (preserves aspect ratio). */
    width?: number;
    /** Resize to this height. */
    height?: number;
    /** Output format. Defaults to input format. */
    format?: "webp" | "avif" | "jpeg" | "png";
    /** Progressive JPEG/PNG (default true). */
    progressive?: boolean;
    /** Output file path. If omitted, returns a Buffer. */
    output?: string;
  }

  export interface ImageResult {
    buffer: Buffer;
    width: number;
    height: number;
    format: string;
    size: number;
  }

  /**
   * Compress and optionally resize an image using sharp.
   */
  export function compressImage(
    input: Buffer | string,
    options?: CompressImageOptions
  ): Promise<ImageResult>;

  // -------------------------------------------------------------------------

  export interface GenerateSrcSetOptions {
    /** Target widths (default [320, 640, 960, 1280, 1920]). */
    widths?: number[];
    /** Output format (default "webp"). */
    format?: "webp" | "avif" | "jpeg" | "png";
    /** Output quality (default 80). */
    quality?: number;
    /** Directory to write files to. */
    outputDir?: string;
    /** File name prefix (default "img"). */
    namePrefix?: string;
  }

  export interface SrcSetResult {
    width: number;
    height: number;
    size: number;
    path?: string;
    buffer: Buffer;
  }

  /**
   * Generate a responsive image set -- multiple sizes of the same image.
   */
  export function generateSrcSet(
    input: Buffer | string,
    options?: GenerateSrcSetOptions
  ): Promise<SrcSetResult[]>;

  // -------------------------------------------------------------------------

  export interface BlurPlaceholderOptions {
    /** Placeholder width in pixels (default 16). */
    size?: number;
  }

  export interface BlurResult {
    /** Data URI (base64-encoded JPEG). */
    base64: string;
    /** CSS snippet for background blur effect. */
    css: string;
    width: number;
    height: number;
  }

  /**
   * Generate a blur placeholder -- a tiny base64-encoded image for use as a
   * CSS background while the full image loads.
   */
  export function blurPlaceholder(
    input: Buffer | string,
    options?: BlurPlaceholderOptions
  ): Promise<BlurResult>;

  // -------------------------------------------------------------------------
  // Video Processing
  // -------------------------------------------------------------------------

  export interface CompressVideoOptions {
    /** Video codec (default "h264"). */
    codec?: "h264" | "h265" | "vp9" | "av1";
    /** Constant rate factor (default 28). Lower = higher quality, bigger file. */
    crf?: number;
    /** Scale to width (preserves aspect ratio). */
    width?: number;
    /** Scale to height. */
    height?: number;
    /** Target framerate. */
    fps?: number;
    /** Include audio track (default true). */
    audio?: boolean;
    /** Audio codec (default "aac"). */
    audioCodec?: "aac" | "opus" | "none";
    /** Audio bitrate in kbps (default 128). */
    audioBitrate?: number;
    /** Trim to max seconds. */
    maxDuration?: number;
    /** Move moov atom for streaming, mp4 only (default true). */
    fastStart?: boolean;
  }

  export interface VideoResult {
    outputPath: string;
    duration: number | null;
    size: number;
  }

  /**
   * Compress/transcode a video using ffmpeg (must be installed on the system).
   */
  export function compressVideo(
    input: string,
    output: string,
    options?: CompressVideoOptions
  ): Promise<VideoResult>;

  // -------------------------------------------------------------------------

  export interface VideoPosterOptions {
    /** Grab frame at this second (default 1). */
    timestamp?: number;
    /** Scale to width. */
    width?: number;
    /** JPEG quality (default 85). */
    quality?: number;
  }

  export interface PosterResult {
    outputPath: string;
    size: number;
  }

  /**
   * Generate a poster image (thumbnail) from a video.
   */
  export function videoPoster(
    input: string,
    output: string,
    options?: VideoPosterOptions
  ): Promise<PosterResult>;

  // -------------------------------------------------------------------------

  export interface VideoFormatSpec {
    format: string;
    codec: string;
    ext: string;
  }

  export interface GenerateVideoFormatsOptions {
    /** Directory for output files. */
    outputDir?: string;
    /** File name prefix (default "video"). */
    namePrefix?: string;
    /** Format list. */
    formats?: VideoFormatSpec[];
    /** Quality (default 28). */
    crf?: number;
    /** Scale width. */
    width?: number;
  }

  export interface VideoFormatResult {
    format: string;
    path: string;
    size: number;
    type: string;
  }

  /**
   * Generate multiple video formats for browser compatibility.
   */
  export function generateVideoFormats(
    input: string,
    options?: GenerateVideoFormatsOptions
  ): Promise<VideoFormatResult[]>;
}
