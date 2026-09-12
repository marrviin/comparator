/**
 * Hoists a file pane's global actions (jump-to-diff / search / reload) into the
 * page's top header, mirroring how TextComparePage hosts them. Folder/git pages
 * keep every pane mounted (only hidden) so editor state survives tab switches,
 * so the header must act on the *active* pane: each pane reports a PaneActions
 * object keyed by its tab path; the page reads the active path's entry.
 *
 * Panes re-report on every render (no dep array) to keep the closures and the
 * button-gating flags fresh. Re-renders of the page are triggered only when a
 * pane's registration or its gating flags change — guarded by a per-path
 * signature so the report → render → report cycle stays finite.
 */
import { useCallback, useRef, useState } from 'react';

/** Actions and button-gating flags a pane hoists into the page header. */
export interface PaneActions {
  goPrev: () => void;
  goNext: () => void;
  toggleSearch: () => void;
  reload: () => void;
  /** Whether the jump/search buttons should render (a diffable pair is loaded). */
  canDiff: boolean;
  /** Whether the reload button should render (at least one side has a file). */
  hasFile: boolean;
}

export function usePaneActions() {
  const panelsRef = useRef(new Map<string, PaneActions>());
  // Last-seen gating signature per path; the state setter below is bumped only
  // when the signature changes, which is what re-renders the page (the value
  // itself is never read — the page re-reads the ref map during render).
  const sigRef = useRef(new Map<string, string>());
  const [, setVersion] = useState(0);

  const reportPanel = useCallback((path: string, actions: PaneActions | null) => {
    if (!actions) {
      if (!panelsRef.current.has(path)) return;
      panelsRef.current.delete(path);
      sigRef.current.delete(path);
      setVersion((v) => v + 1);
      return;
    }
    panelsRef.current.set(path, actions);
    const sig = `${actions.canDiff}:${actions.hasFile}`;
    if (sigRef.current.get(path) !== sig) {
      sigRef.current.set(path, sig);
      setVersion((v) => v + 1);
    }
  }, []);

  // Deliberately not memoized: callers read it during render, and the set-state
  // in reportPanel is what triggers those re-renders when a report changes the
  // map — every render then re-reads the map fresh.
  const getPanel = (path: string | null): PaneActions | null =>
    path ? (panelsRef.current.get(path) ?? null) : null;

  return { reportPanel, getPanel };
}
