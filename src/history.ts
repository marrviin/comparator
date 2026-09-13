/** Persisted "recent comparisons" list, backed by localStorage. */
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface HistoryEntry {
  /** Absolute path of the left file. For git, this is the left ref string. */
  left: string;
  /** Absolute path of the right file. For git, this is the right ref string. */
  right: string;
  /** Basename of the left file, for display. For git, the left ref label. */
  leftName: string;
  /** Basename of the right file, for display. For git, the right ref label. */
  rightName: string;
  /** Comparison type: file (text comparison), folder (folder comparison), or Git repository comparison. */
  kind: 'file' | 'folder' | 'git';
  /** Git-only: repository root directory (empty for file/folder types). */
  repo?: string;
  /** Epoch millis when this pair was last compared. */
  ts: number;
}

const KEY = 'comparator:recent';
const LEGACY_KEY = 'pure-compare:recent';
const MAX = 12;

/**
 * Check whether a batch of history entries' paths still exist, returning the set of stale entry keys.
 * Git entries check the repository root; file/folder entries check both sides (missing either side counts as stale).
 * Uses the backend path_kind to probe in bulk; on failure (e.g. no permission), conservatively treats as "not stale"
 * to avoid false positives.
 */
export function useStaleHistory(entries: HistoryEntry[]): Set<string> {
  const [stale, setStale] = useState<Set<string>>(new Set());
  // Re-probe only when the set of paths being checked changes.
  const sig = entries.map(entryKey).join('\n');
  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = new Set<string>();
      await Promise.all(
        entries.map(async (e) => {
          const paths = e.kind === 'git' ? [e.repo ?? ''] : [e.left, e.right];
          try {
            const kinds = await Promise.all(
              paths.filter(Boolean).map((p) => invoke<string>('path_kind', { path: p })),
            );
            if (kinds.some((k) => k === 'missing')) next.add(entryKey(e));
          } catch {
            // Probe failed: conservatively do not mark as stale.
          }
        }),
      );
      if (alive) setStale(next);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return stale;
}

/** Last path segment, mirroring app.tsx's basename. */
export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/**
 * Stable key for a history entry — also the dedupe identity:
 * - git: the repository root only (one entry per repo, whatever refs were compared);
 * - file/folder: kind + both paths (the same pair of paths compared as files vs folders are distinct entries).
 */
export function entryKey(e: HistoryEntry): string {
  return e.kind === 'git' ? `git|${e.repo ?? ''}` : `${e.kind}|${e.left}|${e.right}`;
}

/** Read the recent list; returns [] on missing or malformed storage. */
export function loadHistory(): HistoryEntry[] {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      // Migrate data written under the pre-rename key ("pure-compare:recent").
      raw = localStorage.getItem(LEGACY_KEY);
      if (raw) localStorage.setItem(KEY, raw);
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (
      parsed
        .filter(
          (e): e is HistoryEntry => e && typeof e.left === 'string' && typeof e.right === 'string',
        )
        // Legacy data has no kind field; default to treating it as a file comparison.
        .map((e) => ({
          ...e,
          kind: e.kind === 'folder' ? 'folder' : e.kind === 'git' ? 'git' : 'file',
        }))
    );
  } catch {
    return [];
  }
}

/**
 * Record a compared pair. Dedupes on {@link entryKey}'s identity (git: repo only;
 * file/folder: kind + both paths): an existing entry keeps its creation position
 * but is refreshed to the latest comparison's paths/refs/ts; a brand-new pair is
 * inserted at the front. Caps at MAX and returns the list.
 *
 * For git comparisons pass `git` with the repo root and the two ref labels;
 * `left`/`right` then carry the ref strings (from/to) instead of file paths.
 */
export function pushHistory(
  left: string,
  right: string,
  kind: 'file' | 'folder' | 'git' = 'file',
  git?: { repo: string; leftName: string; rightName: string },
): HistoryEntry[] {
  const entry: HistoryEntry = {
    left,
    right,
    leftName: git ? git.leftName : basename(left),
    rightName: git ? git.rightName : basename(right),
    kind,
    ...(git ? { repo: git.repo } : {}),
    ts: Date.now(),
  };
  const list = loadHistory();
  // entryKey is the dedupe identity; on a match the stored entry is refreshed in
  // place — for git this also moves its refs to the most recent comparison, so
  // reopening the entry restores what was last looked at.
  const idx = list.findIndex((e) => entryKey(e) === entryKey(entry));
  const next =
    idx >= 0
      ? list.map((e, i) => (i === idx ? { ...e, ...entry } : e))
      : [entry, ...list].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / disabled storage — history is best-effort.
  }
  return next;
}

/**
 * Remove a single recent-comparison entry (matched by its stable {@link entryKey}),
 * persist the shortened list, and return it. Used by the sidebar's right-click
 * "delete" action. A no-op (aside from re-persisting) when the key isn't found.
 */
export function removeHistory(key: string): HistoryEntry[] {
  const next = loadHistory().filter((e) => entryKey(e) !== key);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / disabled storage — history is best-effort.
  }
  return next;
}
