/**
 * Folder comparison file pane — one instance per open file tab inside
 * FolderComparePage. A full side-by-side diff mirroring the text-compare
 * layout: two-side column headers with save, per-hunk copy arrows, minimap,
 * and per-side footer status bars. Both sides are real files on disk, so
 * dropping a file onto a half replaces that side and copy/save stay enabled.
 *
 * The pane stays mounted while other tabs are active (only hidden), so its
 * editor state — scroll, cursor, undo, dirty — survives every tab switch;
 * the jump/search/reload buttons live in DiffPanel's own column headers
 * (showGlobalActions / showReload) and the diff stats in the footer
 * (showStatsInFooter) instead of a page-level toolbar.
 */
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useTranslation } from 'react-i18next';
import { DiffPanel, FileContent, LoadedFile, Side, basename } from '../diff-view';
import { useFolder } from './folder-compare';
import { useFileWatch } from '../use-file-watch';

/** Which pane an x-coordinate falls into (window midline split). */
function sideForX(x: number): Side {
  return x < window.innerWidth / 2 ? 'left' : 'right';
}

export function FolderFilePane({ path, active }: { path: string; active: boolean }) {
  const { t } = useTranslation(['diff', 'common']);
  const { setError, leftDir, rightDir, entries, reportDirty } = useFolder();

  const [left, setLeft] = useState<LoadedFile | null>(null);
  const [right, setRight] = useState<LoadedFile | null>(null);
  const [leftContent, setLeftContent] = useState('');
  const [rightContent, setRightContent] = useState('');
  const [hoverSide, setHoverSide] = useState<Side | null>(null);

  // Load one side's file, tolerating absence (added/removed files exist on one
  // side only). Returns the loaded file + its content, or nulls when missing.
  async function loadSide(fpath: string): Promise<{ file: LoadedFile | null; content: string }> {
    try {
      const meta = await invoke<FileContent>('read_text_file', { path: fpath });
      return { file: { path: fpath, meta }, content: meta.content };
    } catch {
      return { file: null, content: '' };
    }
  }

  function setSide(side: Side, res: { file: LoadedFile | null; content: string }) {
    if (side === 'left') {
      setLeft(res.file);
      setLeftContent(res.content);
    } else {
      setRight(res.file);
      setRightContent(res.content);
    }
  }

  // Column-header picker: replace one side with a chosen file (mirrors text compare).
  async function pickFile(side: Side) {
    setError('');
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: side === 'left' ? t('pickLeftFile') : t('pickRightFile'),
      });
      if (typeof selected !== 'string') return;
      const res = await loadSide(selected);
      setSide(side, res);
    } catch (e) {
      setError(String(e));
    }
  }

  // Load the tab's file into both sides on mount (dirs only change via a new
  // diff, which wipes the tabs — so mount-time is the only interesting load).
  useEffect(() => {
    if (!leftDir || !rightDir) return;
    const entry = entries.find((e) => e.path === path);
    const leftExists = entry ? entry.status !== 'added' : true;
    const rightExists = entry ? entry.status !== 'removed' : true;
    void (async () => {
      const [l, r] = await Promise.all([
        leftExists ? loadSide(`${leftDir}/${path}`) : Promise.resolve({ file: null, content: '' }),
        rightExists
          ? loadSide(`${rightDir}/${path}`)
          : Promise.resolve({ file: null, content: '' }),
      ]);
      setSide('left', l);
      setSide('right', r);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, leftDir, rightDir]);

  // Native Tauri drag-drop: dropping a file onto a half replaces that side.
  // Gated on `active` — every mounted pane registers a listener, and only the
  // visible one may react to a drop.
  useEffect(() => {
    if (!active) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === 'over') {
          setHoverSide(sideForX(p.position.x));
        } else if (p.type === 'drop') {
          setHoverSide(null);
          const paths = p.paths.filter(Boolean);
          if (paths.length === 0) return;
          const side = sideForX(p.position.x);
          void loadSide(paths[0]).then((res) => setSide(side, res));
        } else {
          setHoverSide(null);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [active]);

  const baseNotice = useMemo(() => {
    for (const f of [left, right]) {
      if (!f) continue;
      if (f.meta.is_binary) return t('binaryFile', { name: basename(f.path) });
      if (f.meta.truncated) return t('oversized', { name: basename(f.path) });
    }
    return '';
  }, [left, right, t]);

  const leftOk = !!left && !left.meta.is_binary && !left.meta.truncated;
  const rightOk = !!right && !right.meta.is_binary && !right.meta.truncated;
  const canDiff = (leftOk || rightOk) && !(left && !leftOk) && !(right && !rightOk);

  const leftDirty = !!left && leftContent !== left.meta.content;
  const rightDirty = !!right && rightContent !== right.meta.content;

  // Lift the pane's dirty state to the page so tab close/leave guards can confirm.
  useEffect(() => {
    reportDirty(path, leftDirty || rightDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, leftDirty, rightDirty]);

  const reloadSide = (side: Side) => {
    const file = side === 'left' ? left : right;
    if (file) void loadSide(file.path).then((res) => setSide(side, res));
  };
  // Watch stays armed even while the pane is hidden: a clean background tab
  // reloads silently; a dirty one keeps the notice for when the user returns.
  const leftWatch = useFileWatch({
    path: leftOk ? (left?.path ?? null) : null,
    dirty: leftDirty,
    onReload: () => reloadSide('left'),
  });
  const rightWatch = useFileWatch({
    path: rightOk ? (right?.path ?? null) : null,
    dirty: rightDirty,
    onReload: () => reloadSide('right'),
  });

  // Reload both files and clear the external-change notice — reused by the column-header reload button and DiffPanel.
  function reloadAll() {
    reloadSide('left');
    reloadSide('right');
    leftWatch.dismiss();
    rightWatch.dismiss();
  }

  const notice = leftWatch.externallyChanged
    ? t('leftChangedExternally')
    : rightWatch.externallyChanged
      ? t('rightChangedExternally')
      : baseNotice;

  function onChange(side: Side, text: string) {
    if (side === 'left') setLeftContent(text);
    else setRightContent(text);
  }

  async function saveFile(side: Side) {
    const file = side === 'left' ? left : right;
    if (!file) return;
    const content = side === 'left' ? leftContent : rightContent;
    setError('');
    try {
      const modified = await invoke<number | null>('write_text_file', {
        path: file.path,
        content,
      });
      const nextMeta: FileContent = {
        ...file.meta,
        content,
        size: new TextEncoder().encode(content).length,
        modified,
      };
      const updated: LoadedFile = { ...file, meta: nextMeta };
      if (side === 'left') setLeft(updated);
      else setRight(updated);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <DiffPanel
      left={left}
      right={right}
      leftContent={leftContent}
      rightContent={rightContent}
      notice={notice}
      canDiff={canDiff}
      hoverSide={hoverSide}
      onPick={pickFile}
      onChange={onChange}
      onSave={saveFile}
      onReload={reloadAll}
      showStatsInFooter
      leftDirty={leftDirty}
      rightDirty={rightDirty}
      emptyMode="pick"
    />
  );
}
