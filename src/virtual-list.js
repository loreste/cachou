/**
 * Basic windowed list helper for large catalogs.
 */

import { memo, signal } from "./reactivity.js";

/**
 * @param {{
 *   each: () => any[] | any[],
 *   itemHeight: number,
 *   height: number,
 *   overscan?: number,
 *   children: (item: any, index: number) => any
 * }} props
 */
export function virtualList(props) {
  const [scrollTop, setScrollTop] = signal(0);
  const overscan = props.overscan ?? 4;

  const windowed = memo(() => {
    const list = typeof props.each === "function" ? props.each() : props.each;
    const items = Array.isArray(list) ? list : [];
    const itemHeight = props.itemHeight || 40;
    const height = props.height || 400;
    const start = Math.max(0, Math.floor(scrollTop() / itemHeight) - overscan);
    const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
    const end = Math.min(items.length, start + visibleCount);
    const slice = [];
    for (let i = start; i < end; i++) {
      slice.push({
        index: i,
        item: items[i],
        offset: i * itemHeight,
        node: props.children(items[i], i)
      });
    }
    return {
      totalHeight: items.length * itemHeight,
      start,
      end,
      items: slice
    };
  });

  return {
    windowed,
    scrollTop,
    setScrollTop,
    onScroll(event) {
      const top = event?.target?.scrollTop ?? 0;
      setScrollTop(top);
    }
  };
}
