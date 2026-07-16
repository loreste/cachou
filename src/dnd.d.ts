/**
 * Drag and Drop utilities for Cachou.
 *
 * @module cachoujs/dnd
 */
declare module "cachoujs/dnd" {
  // -------------------------------------------------------------------------
  // Draggable
  // -------------------------------------------------------------------------

  export interface DraggableOptions {
    /** Data payload attached to the drag. */
    data?: any;
    /** Drag type identifier for filtering compatible dropzones. */
    type?: string;
    /** CSS selector for a drag handle within the element. */
    handle?: string;
    /** Class applied during drag (default "cachou-dragging"). */
    dragClass?: string;
    /** Callback on drag start. */
    onDragStart?: (info: { data: any; el: Element; event: DragEvent }) => void;
    /** Callback on drag end. */
    onDragEnd?: (info: { data: any; el: Element; event: DragEvent }) => void;
  }

  // -------------------------------------------------------------------------
  // Dropzone
  // -------------------------------------------------------------------------

  export interface DropzoneOptions {
    /** Only accept drags with matching type. */
    accept?: string;
    /** Callback with dropped data. */
    onDrop?: (data: any, info: { sourceEl: Element | null; event: DragEvent }) => void;
    /** Callback while dragging over. */
    onDragOver?: (info: { data: any; el: Element; event: DragEvent }) => void;
    /** Callback when drag leaves. */
    onDragLeave?: (info: { data: any; el: Element; event: DragEvent }) => void;
    /** Class when a compatible drag is active anywhere (default "cachou-drop-active"). */
    activeClass?: string;
    /** Class when dragging directly over this dropzone (default "cachou-drop-hover"). */
    hoverClass?: string;
  }

  // -------------------------------------------------------------------------
  // Sortable
  // -------------------------------------------------------------------------

  export interface SortableOptions<T = any> {
    /** Signal getter for the item array. */
    items: (() => T[]) | T[];
    /** Signal setter for the item array. */
    setItems: (items: T[]) => void;
    /** CSS selector for drag handle. */
    handle?: string;
    /** Move animation duration in ms (default 150). */
    animation?: number;
    /** Group name for cross-list sorting. */
    group?: string;
  }

  // -------------------------------------------------------------------------
  // DragDropDirectives
  // -------------------------------------------------------------------------

  export interface DragDropDirectives {
    /**
     * Make an element draggable.
     * @param el - Target element.
     * @param optsOrAccessor - Options or accessor returning options.
     * @returns Cleanup function.
     */
    draggable(el: Element, optsOrAccessor: DraggableOptions | (() => DraggableOptions)): () => void;

    /**
     * Make an element a drop target.
     * @param el - Target element.
     * @param optsOrAccessor - Options or accessor returning options.
     * @returns Cleanup function.
     */
    dropzone(el: Element, optsOrAccessor: DropzoneOptions | (() => DropzoneOptions)): () => void;

    /**
     * Make a list sortable via drag and drop.
     * @param el - List container element.
     * @param optsOrAccessor - Options or accessor returning options.
     * @returns Cleanup function.
     */
    sortable<T = any>(el: Element, optsOrAccessor: SortableOptions<T> | (() => SortableOptions<T>)): () => void;
  }

  /**
   * Create drag-and-drop directive factories.
   * Also registers `draggable`, `dropzone`, and `sortable` as Cachou directives.
   */
  export function createDragDrop(): DragDropDirectives;
}
