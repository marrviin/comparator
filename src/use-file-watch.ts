/**
 * Watch an open file for external changes (issue 9). The detail page passes in one
 * side's real disk path + whether it has unsaved changes:
 *   - when the file is changed on disk by another program, if this side has NO unsaved changes -> silently reload;
 *   - if this side HAS unsaved changes -> only set the externallyChanged flag and let the page show a prompt,
 *     letting the user choose to reload (discard local changes) or keep them.
 *
 * Controlled by the watchFiles setting; automatically unwatches when the path changes or watching is turned off.
 * A git ref snapshot is not a disk file (path is null), so it isn't watched.
 */
import { useEffect, useRef, useState } from 'react';
import { watch, type UnwatchFn } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from './settings';

interface Options {
  /** The real absolute disk path to watch; null means don't watch (e.g. a git ref snapshot / no file selected). */
  path: string | null;
  /** Whether this side currently has unsaved changes. */
  dirty: boolean;
  /** Reload callback fired directly by an external change when there are no unsaved changes. */
  onReload: () => void;
}

/**
 * Returns { externallyChanged, dismiss }:
 *   - externallyChanged: true when an external change is detected while there are unsaved changes, for the page to prompt on;
 *   - dismiss(): clears the flag after the user has handled it (reloaded or ignored).
 */
export function useFileWatch({ path, dirty, onReload }: Options) {
  const { settings } = useSettings();
  const watchFiles = settings.watchFiles;
  const [externallyChanged, setExternallyChanged] = useState(false);

  // Keep the callback / dirty in refs so their changes don't cause re-registration of the watcher (registration is async and costly).
  const dirtyRef = useRef(dirty);
  const onReloadRef = useRef(onReload);
  useEffect(() => {
    dirtyRef.current = dirty;
    onReloadRef.current = onReload;
  });

  // Clear the previous file's "externally changed" flag when switching files.
  useEffect(() => {
    setExternallyChanged(false);
  }, [path]);

  useEffect(() => {
    if (!watchFiles || !path) return;
    let unwatch: UnwatchFn | undefined;
    let disposed = false;
    // The capability manifest no longer statically opens up fs:scope=**; instead, before watching we
    // dynamically add "this one current file" to the fs plugin's runtime scope (the watch command allows
    // paths permitted by EITHER the static OR runtime scope), narrowing the watch surface to the file the user is viewing.
    void invoke('allow_watch_path', { path })
      .catch(() => {
        // Even if authorization fails, still try to watch (the static scope may already allow it); a failure is ultimately caught below.
      })
      .then(() =>
        watch(
          path,
          () => {
            // Has unsaved changes: flag the conflict for the page to prompt on; otherwise reload directly.
            if (dirtyRef.current) setExternallyChanged(true);
            else onReloadRef.current();
          },
          { delayMs: 300 },
        ),
      )
      .then((fn) => {
        if (disposed) fn?.();
        else unwatch = fn;
      })
      .catch(() => {
        // Watch failure (permissions / platform limits) degrades silently: doesn't affect the main flow.
      });
    return () => {
      disposed = true;
      unwatch?.();
    };
  }, [watchFiles, path]);

  return {
    externallyChanged,
    dismiss: () => setExternallyChanged(false),
  };
}
