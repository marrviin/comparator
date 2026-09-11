/**
 * Folder comparison layout route. Owns the folder-level state (the two picked
 * directories, the diff tree, and the currently opened relative path) and hands
 * it to its child routes via outlet context, so navigating into a file detail
 * page and back preserves the picked folders and computed tree.
 *
 * Children:
 *   index  -> FolderIndexPage  (folder pickers + diff tree)
 *   /file  -> FolderFilePage   (independent side-by-side detail, mirrors text)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { DiffEntry } from '../diff-tree';
import { Side } from '../diff-view';
import { ShellContext, useShell } from '../layout';
import { useSettings } from '../settings';

/** Context handed to the folder child routes: shell context + folder state. */
export interface FolderContext extends ShellContext {
  leftDir: string | null;
  rightDir: string | null;
  entries: DiffEntry[];
  selectedPath: string | null;
  /** Set one side's directory and (once both are set) recompute the diff. */
  setDir: (side: Side, path: string) => Promise<void>;
  /** Set both sides at once (dropping two folders together) and recompute. */
  setDirs: (dirs: { left?: string; right?: string }) => Promise<void>;
  /** Remember which file the detail page should open. */
  setSelectedPath: (path: string | null) => void;
  /** Shared tree-expanded keys, hoisted here so they survive index <-> file navigation. */
  expandedKeys: string[];
  setExpandedKeys: (keys: string[]) => void;
  /** Recompute the diff for the two currently-picked directories. */
  refresh: () => Promise<void>;
}

/** Typed accessor for the folder outlet context. */
export function useFolder() {
  return useOutletContext<FolderContext>();
}

export function FolderCompareLayout() {
  const shell = useShell();
  const { setError } = shell;
  const { settings } = useSettings();
  // Ignore parameters for diff_dirs (directories + whitespace/case). Kept in a ref so callbacks read the latest values,
  // avoiding stuffing settings into the useCallback deps, which would rebuild setDir/refresh frequently.
  const diffArgsRef = useRef({
    ignore_dirs: settings.ignoreDirs,
    ignore_whitespace: settings.ignoreWhitespace,
    ignore_case: settings.ignoreCase,
  });
  useEffect(() => {
    diffArgsRef.current = {
      ignore_dirs: settings.ignoreDirs,
      ignore_whitespace: settings.ignoreWhitespace,
      ignore_case: settings.ignoreCase,
    };
  }, [settings.ignoreDirs, settings.ignoreWhitespace, settings.ignoreCase]);
  const [leftDir, setLeftDir] = useState<string | null>(null);
  const [rightDir, setRightDir] = useState<string | null>(null);
  const [entries, setEntries] = useState<DiffEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // Hoisted so the tree's expansion survives the round-trip into the file detail page
  // (the index page unmounts there; this layout does not). Cleared on each new diff.
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Compute the diff: allow only one side to exist (pass an empty string for the missing side; the backend marks the other side entirely as added/removed),
  // so importing one side first immediately shows its directory contents without waiting for the other side.
  const runDiff = useCallback(
    async (l: string | null, r: string | null) => {
      if (!l && !r) {
        setEntries([]);
        return;
      }
      setError('');
      try {
        const result = await invoke<DiffEntry[]>('diff_dirs', {
          left: l ?? '',
          right: r ?? '',
          ...diffArgsRef.current,
        });
        setEntries(result);
        setSelectedPath(null);
        setExpandedKeys([]);
      } catch (e) {
        setError(String(e));
      }
    },
    [setError],
  );

  const setDir = useCallback(
    async (side: Side, path: string) => {
      const l = side === 'left' ? path : leftDir;
      const r = side === 'right' ? path : rightDir;
      if (side === 'left') setLeftDir(path);
      else setRightDir(path);
      await runDiff(l, r);
    },
    [leftDir, rightDir, runDiff],
  );

  // Set both sides at once (dragging in two directories together) and compute the diff immediately.
  const setDirs = useCallback(
    async (dirs: { left?: string; right?: string }) => {
      const l = dirs.left ?? leftDir;
      const r = dirs.right ?? rightDir;
      if (dirs.left !== undefined) setLeftDir(dirs.left);
      if (dirs.right !== undefined) setRightDir(dirs.right);
      await runDiff(l, r);
    },
    [leftDir, rightDir, runDiff],
  );

  // Consume router state on each navigation: apply the directories passed from
  // the home page's drag or a re-selected "recent comparison". Keyed on
  // location.key so re-selecting the same folder pair from the sidebar reloads
  // it (a fresh navigation always yields a new key, even for identical state),
  // instead of staying on an empty folder-compare page when already on this route.
  const location = useLocation();
  useEffect(() => {
    const { left, right } = (location.state as { left?: string; right?: string } | null) ?? {};
    if (!left && !right) return;
    setLeftDir(left ?? null);
    setRightDir(right ?? null);
    void runDiff(left ?? null, right ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Recompute the diff after a copy/write, but keep the currently selected file (don't clear selectedPath).
  const refresh = useCallback(async () => {
    if (!leftDir && !rightDir) return;
    setError('');
    try {
      const result = await invoke<DiffEntry[]>('diff_dirs', {
        left: leftDir ?? '',
        right: rightDir ?? '',
        ...diffArgsRef.current,
      });
      setEntries(result);
    } catch (e) {
      setError(String(e));
    }
  }, [leftDir, rightDir, setError]);

  // When the ignore settings change, recompute the diff for the already-open directory pair (so settings take effect immediately).
  useEffect(() => {
    if (leftDir || rightDir) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ignoreDirs, settings.ignoreWhitespace, settings.ignoreCase]);

  // Record history (kind=folder) once both directories are selected, for the left sidebar's "recent comparisons" to restore.
  const { pushRecent } = shell;
  useEffect(() => {
    if (leftDir && rightDir) pushRecent(leftDir, rightDir, 'folder');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftDir, rightDir]);

  const ctx = useMemo<FolderContext>(
    () => ({
      ...shell,
      leftDir,
      rightDir,
      entries,
      selectedPath,
      setDir,
      setDirs,
      setSelectedPath,
      expandedKeys,
      setExpandedKeys,
      refresh,
    }),
    [shell, leftDir, rightDir, entries, selectedPath, setDir, setDirs, expandedKeys, refresh],
  );

  return <Outlet context={ctx} />;
}
