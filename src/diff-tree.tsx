/**
 * Base types and size-measurement hook shared by folder / Git comparison.
 * The actual diff rendering lives in `diff-table.tsx` (antd Table tree + virtual scrolling).
 */
import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Measure a container's pixel width/height. antd `Table` virtual mode needs a numeric `scroll.y`
 * to virtualize, and the adaptive "name" column width must be computed from the container width
 * minus the fixed-width columns -- both are needed. Returns a ref to attach to the scroll
 * container along with its current inner size.
 */
export function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Per-file status shared by folder + git diffs. */
export type EntryStatus = 'added' | 'removed' | 'modified' | 'renamed' | 'equal';

export interface DiffEntry {
  /** Forward-slash relative path. */
  path: string;
  status: EntryStatus;
  /** Only meaningful for whole-tree add/remove directory entries. */
  is_dir?: boolean;
  /** File byte size on each side (folder diff only; null for dirs/absent). */
  left_size?: number | null;
  right_size?: number | null;
  /** Last-modified time on each side, epoch seconds (folder diff only). */
  left_mtime?: number | null;
  right_mtime?: number | null;
}
