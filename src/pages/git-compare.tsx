/**
 * Git comparison layout route. Owns the repo-level state (the opened repo, the
 * two picked refs, the synthesized diff entries) and hands it to its child routes
 * via outlet context, mirroring folder-compare. Navigating into a file detail
 * page and back preserves the repo + refs + computed tree.
 *
 * Splitting the former single GitCompareView into real nested routes (index tree
 * + /file detail) is what lets useUnsavedGuard — which blocks on route changes —
 * actually fire when leaving a dirty working-tree file, instead of the old
 * internal `detailPath` state that never changed the route.
 *
 * Children:
 *   index  -> GitIndexPage  (repo picker + ref pickers + diff tree)
 *   /file  -> GitFilePage   (side-by-side detail; worktree side writable)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { DiffEntry } from '../diff-tree';
import { ShellContext, useShell } from '../layout';

/** Sentinel ref value meaning "the working tree" (empty rev to the backend). */
export const WORKTREE = '__worktree__';

export interface GitCommit {
  hash: string;
  short: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitRepoInfo {
  is_repo: boolean;
  root: string;
  current_branch: string;
  branches: string[];
  commits: GitCommit[];
}

/** Map a picker value to the rev string the backend expects ("" = worktree). */
export function toRev(v: string): string {
  return v === WORKTREE ? '' : v;
}

/**
 * Human-readable label for a ref value, used in history display. The worktree
 * label is passed in so this stays a pure helper (i18n's t is only available in
 * components); callers pass t('git:worktree').
 */
export function refLabel(v: string, repo: GitRepoInfo | null, worktreeLabel: string): string {
  if (v === WORKTREE) return worktreeLabel;
  const c = repo?.commits.find((x) => x.hash === v);
  if (c) return `${c.short} ${c.subject}`;
  return v;
}

/** Context handed to the git child routes: shell context + git compare state. */
export interface GitContext extends ShellContext {
  repo: GitRepoInfo | null;
  from: string | null;
  to: string;
  entries: DiffEntry[];
  /** The relative path the detail page should open (null on the tree). */
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  /** Shared tree-expanded keys, hoisted here so they survive index <-> file navigation. */
  expandedKeys: string[];
  setExpandedKeys: (keys: string[]) => void;
  /** Open (or reopen) a repo by directory, optionally restoring two refs. */
  loadRepo: (path: string, wantFrom?: string, wantTo?: string) => Promise<void>;
  /** Change one side's ref and recompute the diff. */
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  /** Recompute the diff for the current repo + refs. */
  refresh: () => void;
}

/** Typed accessor for the git outlet context. */
export function useGit() {
  return useOutletContext<GitContext>();
}

export function GitCompareLayout() {
  const shell = useShell();
  const { setError, pushRecent } = shell;
  const location = useLocation();
  const { t } = useTranslation('git');

  const [repo, setRepo] = useState<GitRepoInfo | null>(null);
  const [from, setFromState] = useState<string | null>(null);
  const [to, setToState] = useState<string>(WORKTREE);
  const [entries, setEntries] = useState<DiffEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // Hoisted so the tree's expansion survives the round-trip into the file detail page
  // (the index page unmounts there; this layout does not). Cleared on each new diff.
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Compute the diff between the two refs and record one history entry (kind=git).
  const runDiff = useCallback(
    async (root: string, f: string, tgt: string, info: GitRepoInfo | null) => {
      setError('');
      try {
        const result = await invoke<DiffEntry[]>('git_diff_refs', {
          repo: root,
          from: toRev(f),
          to: toRev(tgt),
        });
        setEntries(result);
        setSelectedPath(null);
        setExpandedKeys([]);
        const ctx = info ?? repo;
        const wt = t('worktree');
        pushRecent(f, tgt, 'git', {
          repo: root,
          leftName: refLabel(f, ctx, wt),
          rightName: refLabel(tgt, ctx, wt),
        });
      } catch (e) {
        setError(String(e));
      }
    },
    [setError, pushRecent, repo, t],
  );

  const loadRepo = useCallback(
    async (path: string, wantFrom?: string, wantTo?: string) => {
      setError('');
      try {
        const info = await invoke<GitRepoInfo>('git_repo_info', { path });
        if (!info.is_repo) {
          setError(t('notGitRepo'));
          setRepo(null);
          return;
        }
        setRepo(info);
        const known = (v?: string) =>
          !!v &&
          (v === WORKTREE || info.branches.includes(v) || info.commits.some((c) => c.hash === v));
        const defaultFrom = info.current_branch || info.branches[0] || null;
        const initialFrom = known(wantFrom) ? wantFrom! : defaultFrom;
        const initialTo = known(wantTo) ? wantTo! : WORKTREE;
        setFromState(initialFrom);
        setToState(initialTo);
        setEntries([]);
        setSelectedPath(null);
        setExpandedKeys([]);
        if (initialFrom) await runDiff(info.root, initialFrom, initialTo, info);
      } catch (e) {
        setError(String(e));
      }
    },
    [setError, runDiff, t],
  );

  const setFrom = useCallback(
    (v: string) => {
      setFromState(v);
      if (repo) void runDiff(repo.root, v, to, repo);
    },
    [repo, to, runDiff],
  );

  const setTo = useCallback(
    (v: string) => {
      setToState(v);
      if (repo && from) void runDiff(repo.root, from, v, repo);
    },
    [repo, from, runDiff],
  );

  const refresh = useCallback(() => {
    if (repo && from) void runDiff(repo.root, from, to, repo);
  }, [repo, from, to, runDiff]);

  // Consume router state on each navigation: auto-load the repo/refs passed from
  // a re-selected "recent comparison". Keyed on location.key so re-selecting the
  // same repo from the sidebar reloads it (a fresh navigation always yields a new
  // key, even for identical state), instead of staying on the current page when
  // already on this route.
  useEffect(() => {
    const initState = location.state as { repo?: string; from?: string; to?: string } | null;
    if (initState?.repo)
      void loadRepo(initState.repo, initState.from ?? undefined, initState.to ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const ctx = useMemo<GitContext>(
    () => ({
      ...shell,
      repo,
      from,
      to,
      entries,
      selectedPath,
      setSelectedPath,
      expandedKeys,
      setExpandedKeys,
      loadRepo,
      setFrom,
      setTo,
      refresh,
    }),
    [
      shell,
      repo,
      from,
      to,
      entries,
      selectedPath,
      expandedKeys,
      loadRepo,
      setFrom,
      setTo,
      refresh,
    ],
  );

  return <Outlet context={ctx} />;
}
