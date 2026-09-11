/**
 * Git comparison file pane — one instance per open file tab inside
 * GitComparePage. A full side-by-side diff: each side loads its content via
 * `git_show` at that side's ref; ref snapshots are read-only, while the
 * working-tree side (if either ref is WORKTREE) is a real disk file that can
 * be edited, saved, and watched.
 *
 * The pane stays mounted while other tabs are active (only hidden), so its
 * editor state survives every tab switch; the jump/search/reload buttons live
 * in DiffPanel's own column headers (showGlobalActions / showReload) and the
 * diff stats in the footer (showStatsInFooter) instead of a page-level
 * toolbar. Dirty state is lifted to the page for the tab close/leave guards.
 */
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { DiffPanel, FileContent, LoadedFile, Side } from '../diff-view';
import { useFileWatch } from '../use-file-watch';
import { useGit, WORKTREE, toRev } from './git-compare';

export function GitFilePane({ path }: { path: string }) {
  const { t } = useTranslation(['diff', 'common', 'git']);
  const { setError, repo, from, to, entries, reportDirty } = useGit();

  const [left, setLeft] = useState<LoadedFile | null>(null);
  const [right, setRight] = useState<LoadedFile | null>(null);
  const [leftContent, setLeftContent] = useState('');
  const [rightContent, setRightContent] = useState('');

  async function loadSide(
    rev: string,
    fpath: string,
    exists: boolean,
  ): Promise<{ file: LoadedFile | null; content: string }> {
    if (!exists || !repo) return { file: null, content: '' };
    const label = rev === WORKTREE ? t('git:worktree') : rev;
    try {
      const meta = await invoke<FileContent>('git_show', {
        repo: repo.root,
        rev: toRev(rev),
        path: fpath,
      });
      return {
        file: { path: `${label}:${fpath}`, meta, label: `${label} · ${fpath}` },
        content: meta.content,
      };
    } catch {
      return { file: null, content: '' };
    }
  }

  // Load both sides' content for the tab's file (on mount — refs only change
  // via a new diff, which wipes the tabs).
  async function openFile(fpath: string) {
    if (!repo || !from) return;
    const entry = entries.find((e) => e.path === fpath);
    const leftExists = entry ? entry.status !== 'added' : true;
    const rightExists = entry ? entry.status !== 'removed' : true;
    const [l, r] = await Promise.all([
      loadSide(from, fpath, leftExists),
      loadSide(to, fpath, rightExists),
    ]);
    setLeft(l.file);
    setRight(r.file);
    setLeftContent(l.content);
    setRightContent(r.content);
  }

  useEffect(() => {
    if (repo && from) void openFile(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const canDiff =
    !!(left || right) &&
    !(left?.meta.is_binary || right?.meta.is_binary) &&
    !(left?.meta.truncated || right?.meta.truncated);

  const leftReadonly = from !== WORKTREE;
  const rightReadonly = to !== WORKTREE;
  const leftDirty = !!left && !leftReadonly && leftContent !== left.meta.content;
  const rightDirty = !!right && !rightReadonly && rightContent !== right.meta.content;

  // Lift the pane's dirty state to the page so tab close/leave guards can confirm.
  useEffect(() => {
    reportDirty(path, leftDirty || rightDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, leftDirty, rightDirty]);

  // Only the working-tree side is a real file on disk and can be watched for external changes; the ref-snapshot side isn't watched.
  // Stays armed while the pane is hidden: a clean background tab reloads silently; a dirty one keeps the notice.
  const worktreeSide: Side | null = from === WORKTREE ? 'left' : to === WORKTREE ? 'right' : null;
  const worktreeDirty =
    worktreeSide === 'left' ? leftDirty : worktreeSide === 'right' ? rightDirty : false;
  const watch = useFileWatch({
    path: path && worktreeSide ? `${repo?.root ?? ''}/${path}` : null,
    dirty: worktreeDirty,
    onReload: () => void openFile(path),
  });

  const notice = watch.externallyChanged
    ? t('worktreeChangedExternally')
    : left?.meta.is_binary || right?.meta.is_binary
      ? t('binaryFileShort')
      : left?.meta.truncated || right?.meta.truncated
        ? t('oversizedShort')
        : '';

  function onChange(side: Side, text: string) {
    if (side === 'left') setLeftContent(text);
    else setRightContent(text);
  }

  // Only the working-tree side is a real file that can be written back.
  async function saveFile(side: Side) {
    if (!repo) return;
    const rev = side === 'left' ? from : to;
    if (rev !== WORKTREE) return; // ref snapshots are read-only
    const content = side === 'left' ? leftContent : rightContent;
    const fullPath = `${repo.root}/${path}`;
    setError('');
    try {
      await invoke<number | null>('write_text_file', { path: fullPath, content });
      // After saving, reload this side to refresh meta.content and clear the dirty flag.
      void openFile(path);
    } catch (e) {
      setError(String(e));
    }
  }

  // Reload the tab's file and clear the external-change prompt -- reused by the column-header reload button and DiffPanel.
  function reloadAll() {
    void openFile(path);
    watch.dismiss();
  }

  return (
    <DiffPanel
      left={left}
      right={right}
      leftContent={leftContent}
      rightContent={rightContent}
      notice={notice}
      canDiff={canDiff}
      onChange={onChange}
      onSave={saveFile}
      onReload={reloadAll}
      showStatsInFooter
      leftDirty={leftDirty}
      rightDirty={rightDirty}
      leftReadonly={leftReadonly}
      rightReadonly={rightReadonly}
      emptyMode="hint"
    />
  );
}
