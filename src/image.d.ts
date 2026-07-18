/**
 * Image / Picture / Video helpers (experimental).
 * @module cachoujs/image
 */
declare module "cachoujs/image" {
  export function resolveAspectRatio(
    aspectRatio: string | number | undefined,
    width: number | undefined,
    height: number | undefined
  ): { width: number | undefined; height: number | undefined };

  export function buildSrcSet(
    source: string | ((width: number) => string),
    widths: number[],
    options?: {
      density?: boolean;
      format?: (url: string, width: number) => string;
    }
  ): string;

  export function buildSizes(
    rules: Array<{ max?: number; size: string } | string>
  ): string;

  export function responsiveImageProps(options: {
    src: string | ((width: number) => string);
    widths?: number[];
    sizes?: Array<{ max?: number; size: string } | string> | string;
    defaultWidth?: number;
    alt?: string;
    format?: (url: string, width: number) => string;
    [key: string]: any;
  }): Record<string, any>;

  export interface ImageProps {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    loading?: "lazy" | "eager";
    decoding?: "async" | "sync" | "auto";
    srcset?: string;
    sizes?: string;
    placeholder?: "none" | "blur" | "color";
    placeholderColor?: string;
    priority?: boolean;
    aspectRatio?: string | number;
    fit?: string;
    quality?: number;
    class?: string;
    style?: Record<string, string> | string;
    onLoad?: (info: { target: HTMLImageElement; src: string }) => void;
    onError?: (info: {
      target: HTMLImageElement;
      src: string;
      error?: any;
    }) => void;
  }

  export function Image(props: ImageProps): any;

  export interface PictureSource {
    srcset: string;
    type?: string;
    media?: string;
    sizes?: string;
  }

  export interface PictureProps extends ImageProps {
    sources?: PictureSource[];
  }

  export function Picture(props: PictureProps): any;

  export interface VideoSource {
    src: string;
    type?: string;
  }

  export interface VideoProps {
    src?: string;
    sources?: VideoSource[];
    poster?: string;
    width?: number;
    height?: number;
    aspectRatio?: string | number;
    controls?: boolean;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    playsinline?: boolean;
    lazy?: boolean;
    priority?: boolean;
    preload?: string;
    fit?: string;
    class?: string;
    track?: string;
    trackLang?: string;
    trackLabel?: string;
    trackKind?: "subtitles" | "captions" | "descriptions";
    onError?: (info: any) => void;
    onLoadedMetadata?: (info: any) => void;
  }

  export function Video(props: VideoProps): any;
}
