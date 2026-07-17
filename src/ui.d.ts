/**
 * Built-in UI components for Cachou.
 *
 * @module cachoujs/ui
 */
declare module "cachoujs/ui" {
  // -------------------------------------------------------------------------
  // Toast
  // -------------------------------------------------------------------------

  export type ToastPosition =
    | "top-right"
    | "top-left"
    | "bottom-right"
    | "bottom-left"
    | "top-center"
    | "bottom-center";

  export interface ToastOptions {
    /** Position of the toast container (default "top-right"). */
    position?: ToastPosition;
    /** Maximum number of visible toasts (default 5). */
    max?: number;
  }

  export interface ToastShowOptions {
    /** Visual type of the toast. */
    type?: "info" | "success" | "warning" | "error";
    /** Auto-dismiss duration in ms (default 4000). Set to 0 to disable. */
    duration?: number;
    /** Optional action button. */
    action?: { label: string; onClick: () => void };
    /** Whether the toast can be dismissed manually (default true). */
    dismissible?: boolean;
  }

  export interface ToastController {
    /** Show a toast message. Returns the unique toast id. */
    show(message: string, opts?: ToastShowOptions): string;
    /** Show a success toast. */
    success(message: string, opts?: ToastShowOptions): string;
    /** Show an error toast. */
    error(message: string, opts?: ToastShowOptions): string;
    /** Show an info toast. */
    info(message: string, opts?: ToastShowOptions): string;
    /** Show a warning toast. */
    warning(message: string, opts?: ToastShowOptions): string;
    /** Dismiss a toast by id. */
    dismiss(id: string): void;
    /** Dismiss all active toasts. */
    dismissAll(): void;
    /** Clear timers, remove all toasts, and detach the container. */
    destroy(): void;
    /** Create and return the toast container element. Append to document.body. */
    mount(): HTMLElement | null;
  }

  /**
   * Create a toast notification controller.
   */
  export function createToast(options?: ToastOptions): ToastController;

  // -------------------------------------------------------------------------
  // Drawer
  // -------------------------------------------------------------------------

  export interface DrawerProps {
    /** Whether the drawer is open. Accepts a signal getter or plain boolean. */
    open: (() => boolean) | boolean;
    /** Called when the drawer should close. */
    onClose?: () => void;
    /** Slide direction (default "right"). */
    side?: "left" | "right" | "top" | "bottom";
    /** CSS width (for left/right) or height (for top/bottom). */
    size?: string;
    /** Show backdrop overlay (default true). */
    backdrop?: boolean;
    /** Content render function. */
    children: (() => Node) | Node;
  }

  /**
   * Accessible slide-in drawer (panel) component.
   */
  export function Drawer(props: DrawerProps): (() => Node | null);

  // -------------------------------------------------------------------------
  // Popover
  // -------------------------------------------------------------------------

  export interface PopoverProps {
    /** The anchor element. */
    anchor: HTMLElement | (() => HTMLElement);
    /** Whether the popover is open. Accepts a signal getter or plain boolean. */
    open: (() => boolean) | boolean;
    /** Called when the popover should close. */
    onClose?: () => void;
    /** Preferred placement (default "bottom"). */
    placement?: "top" | "bottom" | "left" | "right";
    /** Pixel offset from anchor (default 8). */
    offset?: number;
    /** Content render function. */
    children: (() => Node) | Node;
  }

  /**
   * Popover component that positions itself relative to an anchor element.
   */
  export function Popover(props: PopoverProps): (() => Node | null);

  // -------------------------------------------------------------------------
  // Menu
  // -------------------------------------------------------------------------

  export interface MenuItem {
    /** Display label. */
    label?: string;
    /** Click handler. */
    onClick?: () => void;
    /** Render as a danger/destructive item. */
    danger?: boolean;
    /** Set to "separator" to render a divider. */
    type?: "separator";
  }

  export interface MenuProps {
    /** Render function for the trigger element. */
    trigger: (() => Node) | Node;
    /** Menu items array. */
    items: MenuItem[];
    /** Additional CSS class for the container. */
    class?: string;
  }

  /**
   * Dropdown menu component with keyboard navigation.
   */
  export function Menu(props: MenuProps): Node;

  // -------------------------------------------------------------------------
  // DataTable
  // -------------------------------------------------------------------------

  export interface DataTableColumn {
    /** Property key on data objects. */
    key: string;
    /** Display header label. */
    label: string;
    /** Enable sorting for this column. */
    sortable?: boolean;
    /** Enable text filtering for this column. */
    filterable?: boolean;
    /** Custom cell render function. */
    render?: (value: any, row: Record<string, any>) => Node | string | null;
  }

  export interface DataTableProps {
    /** Data rows. Accepts a signal getter or plain array. */
    data: (() => Record<string, any>[]) | Record<string, any>[];
    /** Column definitions. */
    columns: DataTableColumn[];
    /** Enable row selection with checkboxes. */
    selectable?: boolean;
    /** Rows per page (default shows all). */
    pageSize?: number;
    /** External sort callback. */
    onSort?: (key: string, dir: "asc" | "desc" | null) => void;
    /** External filter callback. */
    onFilter?: (filters: Record<string, string>) => void;
    /** Selection change callback. */
    onSelect?: (selected: Record<string, any>[]) => void;
    /** Message when no data (default "No data"). */
    emptyMessage?: string;
    /** Additional CSS class. */
    class?: string;
  }

  /**
   * Data table component with sorting, filtering, pagination, and selection.
   */
  export function DataTable(props: DataTableProps): HTMLElement | null;

  // -------------------------------------------------------------------------
  // InfiniteScroll
  // -------------------------------------------------------------------------

  export interface InfiniteScrollLoadResult<T = any> {
    items: T[];
    nextCursor: any;
  }

  export interface InfiniteScrollProps<T = any> {
    /** Async load function. Receives the current cursor. */
    load: (cursor: any) => Promise<InfiniteScrollLoadResult<T>>;
    /** Render function receiving a signal getter for the items array. */
    children: (items: () => T[]) => Node;
    /** Pixels from bottom to trigger load (default 200). */
    threshold?: number;
    /** Loading indicator render function. */
    loader?: () => Node;
    /** End-of-list message render function. */
    endMessage?: () => Node;
  }

  /**
   * Infinite scroll component using IntersectionObserver.
   */
  export function InfiniteScroll<T = any>(props: InfiniteScrollProps<T>): HTMLElement | null;

  // -------------------------------------------------------------------------
  // Tabs
  // -------------------------------------------------------------------------

  export interface TabItem {
    /** Unique tab key. */
    key: string;
    /** Display label. */
    label: string;
    /** Tab panel content render function. */
    content: () => Node;
    /** Optional badge number. */
    badge?: number;
  }

  export interface TabsProps {
    /** Tab items. */
    items: TabItem[];
    /** Active tab key (signal getter for controlled mode). */
    active?: (() => string) | string;
    /** Called when the active tab changes. */
    onChange?: (key: string) => void;
    /** Additional CSS class. */
    class?: string;
  }

  /**
   * Accessible tabbed interface component.
   */
  export function Tabs(props: TabsProps): HTMLElement | null;

  // -------------------------------------------------------------------------
  // Accordion
  // -------------------------------------------------------------------------

  export interface AccordionItem {
    /** Unique item key. */
    key: string;
    /** Header title text. */
    title: string;
    /** Panel content render function. */
    content: () => Node;
  }

  export interface AccordionProps {
    /** Accordion items. */
    items: AccordionItem[];
    /** Allow multiple panels open at once (default false). */
    multiple?: boolean;
    /** Keys of initially open panels. */
    defaultOpen?: string[];
    /** Additional CSS class. */
    class?: string;
  }

  /**
   * Accessible accordion component with animated expand/collapse.
   */
  export function Accordion(props: AccordionProps): HTMLElement | null;

  // -------------------------------------------------------------------------
  // Breadcrumbs
  // -------------------------------------------------------------------------

  export interface BreadcrumbItem {
    /** Display label. */
    label: string;
    /** Link URL. Omit for the current (last) page. */
    href?: string;
  }

  export interface BreadcrumbsProps {
    /** Breadcrumb items. */
    items: BreadcrumbItem[];
    /** Separator character (default "\u203A"). */
    separator?: string | Node;
    /** Additional CSS class. */
    class?: string;
  }

  /**
   * Accessible breadcrumb navigation component.
   */
  export function Breadcrumbs(props: BreadcrumbsProps): HTMLElement | null;

  // -------------------------------------------------------------------------
  // Tooltip
  // -------------------------------------------------------------------------

  export interface TooltipProps {
    /** Tooltip text content. */
    content: string;
    /** Render function for the trigger element. */
    children: (() => Node) | Node;
    /** Preferred placement (default "top"). */
    placement?: "top" | "bottom" | "left" | "right";
    /** Show delay in ms (default 300). */
    delay?: number;
    /** Additional CSS class for the tooltip element. */
    class?: string;
  }

  /**
   * Accessible tooltip component that shows on hover/focus.
   */
  export function Tooltip(props: TooltipProps): HTMLElement;

  // -------------------------------------------------------------------------
  // Avatar
  // -------------------------------------------------------------------------

  export interface AvatarProps {
    /** Image source URL. */
    src?: string;
    /** Alt text for the image. */
    alt?: string;
    /** Size in pixels (default 40). */
    size?: number;
    /** Initials text when no image or image fails to load. */
    fallback?: string;
    /** Background color for initials (auto-derived from fallback if omitted). */
    color?: string;
    /** Additional CSS class. */
    class?: string;
  }

  /**
   * Avatar component that displays an image or fallback initials.
   */
  export function Avatar(props: AvatarProps): HTMLElement | null;

  // -------------------------------------------------------------------------
  // Badge
  // -------------------------------------------------------------------------

  export interface BadgeProps {
    /** Badge text content. */
    text: string;
    /** Visual variant (default "neutral"). */
    variant?: "neutral" | "success" | "warning" | "danger" | "info";
    /** Use fully rounded (pill) shape (default false). */
    pill?: boolean;
    /** Additional CSS class. */
    class?: string;
  }

  /**
   * Inline badge/label component with variant styling.
   */
  export function Badge(props: BadgeProps): HTMLElement | null;
}
