/**
 * "Synchronized scrolling" controller for multiple scroll containers
 * (Beyond Compare-style two-pane linkage). Each pane registers via
 * `register(container)`; on registration it finds the inner node that the
 * antd virtual list actually scrolls (for Table virtual mode this is
 * `.ant-table-tbody-virtual-holder`). When any pane scrolls, its scrollTop is
 * written to the other panes. A one-shot lock + rAF release avoids write-back loops.
 */
import { useCallback, useRef } from 'react';

/**
 * Class name of the inner container that actually scrolls once virtual
 * scrolling is enabled. Prefers the antd `Table` virtual-mode holder and
 * stays compatible with the legacy `Tree` holder (the comma selector picks
 * whichever appears first in the document).
 */
const HOLDER = '.ant-table-tbody-virtual-holder, .ant-tree-list-holder';

export function useScrollSync() {
  const holders = useRef<HTMLElement[]>([]);
  const locked = useRef(false);

  const register = useCallback((container: HTMLElement | null) => {
    if (!container) return () => {};
    // The virtual list's holder only appears after mount; poll a few frames until we get it.
    let holder: HTMLElement | null = null;
    let raf = 0;
    const onScroll = () => {
      if (locked.current || !holder) return;
      locked.current = true;
      const top = holder.scrollTop;
      for (const other of holders.current) {
        if (other !== holder && other.scrollTop !== top) {
          other.scrollTop = top;
        }
      }
      requestAnimationFrame(() => {
        locked.current = false;
      });
    };
    const attach = () => {
      holder = container.querySelector<HTMLElement>(HOLDER);
      if (holder) {
        holders.current.push(holder);
        holder.addEventListener('scroll', onScroll, { passive: true });
      } else {
        raf = requestAnimationFrame(attach);
      }
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      if (holder) {
        holder.removeEventListener('scroll', onScroll);
        holders.current = holders.current.filter((e) => e !== holder);
      }
    };
  }, []);

  return register;
}

/** Register function type: takes a pane container, returns an unregister callback. */
export type ScrollRegister = (el: HTMLElement | null) => () => void;
