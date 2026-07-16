/**
 * Loading & feedback components for Cachou.
 *
 * @module cachoujs/feedback
 */
declare module "cachoujs/feedback" {
  // -------------------------------------------------------------------------
  // Progress
  // -------------------------------------------------------------------------

  export interface ProgressProps {
    /** Current progress value. Accepts a signal getter or plain number. */
    value?: (() => number) | number;
    /** Maximum value (default 100). */
    max?: number;
    /** Show indeterminate animation. */
    indeterminate?: boolean;
    /** Color variant (default "info"). */
    variant?: "info" | "success" | "warning" | "danger";
    /** Bar height (default "md"). */
    size?: "sm" | "md" | "lg";
    /** Accessible text label shown above the bar. */
    label?: string;
  }

  /**
   * Progress bar component.
   */
  export function Progress(props: ProgressProps): HTMLElement | null;

  // -------------------------------------------------------------------------
  // Spinner
  // -------------------------------------------------------------------------

  export interface SpinnerProps {
    /** Diameter in pixels (default 24). */
    size?: number;
    /** Spinner color (default "currentColor"). */
    color?: string;
    /** Accessible label for screen readers (default "Loading"). */
    label?: string;
  }

  /**
   * CSS-only spinning circle indicator.
   */
  export function Spinner(props?: SpinnerProps): HTMLElement | null;

  // -------------------------------------------------------------------------
  // Skeleton
  // -------------------------------------------------------------------------

  export interface SkeletonProps {
    /** Width in px or CSS string (default "100%"). */
    width?: number | string;
    /** Height in px or CSS string (default 16). */
    height?: number | string;
    /** Border radius in px (default 4). */
    radius?: number;
    /** Render as a circle. */
    circle?: boolean;
    /** Render multiple skeleton lines. */
    lines?: number;
    /** Gap between lines in px (default 8). */
    gap?: number;
  }

  /**
   * Skeleton placeholder component for loading states.
   */
  export function Skeleton(props?: SkeletonProps): HTMLElement | null;

  // -------------------------------------------------------------------------
  // CommandPalette
  // -------------------------------------------------------------------------

  export interface Command {
    /** Unique identifier. */
    id: string;
    /** Display label. */
    label: string;
    /** Group heading. */
    section?: string;
    /** Handler when executed. */
    action: () => void;
    /** Keyboard shortcut hint, e.g. "mod+,". */
    shortcut?: string;
  }

  export interface CommandPaletteProps {
    /** Array of commands. */
    commands: Command[];
    /** Input placeholder (default "Type a command..."). */
    placeholder?: string;
    /** Keyboard shortcut to toggle open (default "mod+k"). */
    hotkey?: string;
    /** Maximum results shown (default 10). */
    maxResults?: number;
    /** Called when the palette closes. */
    onClose?: () => void;
  }

  export interface CommandPaletteController {
    /** Open the palette. */
    open(): void;
    /** Close the palette. */
    close(): void;
    /** Signal getter for open state. */
    isOpen(): boolean;
    /** The palette root element (comment node placeholder). */
    el: Node | null;
  }

  /**
   * Command palette modal with fuzzy search and keyboard navigation.
   */
  export function CommandPalette(props: CommandPaletteProps): CommandPaletteController;

  // -------------------------------------------------------------------------
  // CSV Utilities
  // -------------------------------------------------------------------------

  export interface CsvExportOptions {
    /** Keys to include (default: all keys from first row). */
    columns?: string[];
    /** Custom header labels (default: column keys). */
    headers?: string[];
    /** Field separator (default ","). */
    delimiter?: string;
    /** Include header row (default true). */
    includeHeaders?: boolean;
  }

  /**
   * Convert an array of objects to a CSV string (RFC 4180 compliant).
   */
  export function csvExport(data: Record<string, any>[], options?: CsvExportOptions): string;

  /**
   * Trigger a browser download of a CSV string. SSR-safe (no-op on server).
   */
  export function downloadCSV(csvString: string, filename?: string): void;
}
