/**
 * Folder comparison detail page. Opens the file selected in the folder tree as
 * a full side-by-side diff, mirroring the text-compare layout exactly: two-side
 * column headers with save, per-hunk copy arrows, minimap, and per-side footer
 * status bars. Both sides are real files on disk, so dropping a file onto a half
 * replaces that side and copy/save stay enabled.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { Button, Divider, Space, Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  LeftOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { DiffPanel, DiffPanelHandle, FileContent, LoadedFile, Side, basename } from '../diff-view';
import { AppHeader } from '../app-header';
import { useFolder } from './folder-compare';
import { useFileWatch } from '../use-file-watch';
import { useUnsavedGuard } from '../use-unsaved-guard';

/** Which pane an x-coordinate falls into (window midline split). */
function sideForX(x: number): Side {
  return x < window.innerWidth / 2 ? 'left' : 'right';
}

export function FolderFilePage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['diff', 'common']);
  const { setError, siderCollapsed, onExpandSider, leftDir, rightDir, entries, selectedPath } =
    useFolder();

  const [left, setLeft] = useState<LoadedFile | null>(null);
  const [right, setRight] = useState<LoadedFile | null>(null);
  const [leftContent, setLeftContent] = useState('');
  const [rightContent, setRightContent] = useState('');
  const [hoverSide, setHoverSide] = useState<Side | null>(null);

  // No file was selected (e.g. deep-linked or refreshed) — bounce back to the tree.
  useEffect(() => {
    if (!selectedPath || !leftDir || !rightDir) navigate('/folder-compare', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load one side's file, tolerating absence (added/removed files exist on one
  // side only). Returns the loaded file + its content, or nulls when missing.
  async function loadSide(path: string): Promise<{ file: LoadedFile | null; content: string }> {
    try {
      const meta = await invoke<FileContent>('read_text_file', { path });
      return { file: { path, meta }, content: meta.content };
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

  // Load the selected tree entry into both sides on mount / selection change.
  useEffect(() => {
    if (!selectedPath || !leftDir || !rightDir) return;
    const entry = entries.find((e) => e.path === selectedPath);
    const leftExists = entry ? entry.status !== 'added' : true;
    const rightExists = entry ? entry.status !== 'removed' : true;
    void (async () => {
      const [l, r] = await Promise.all([
        leftExists
          ? loadSide(`${leftDir}/${selectedPath}`)
          : Promise.resolve({ file: null, content: '' }),
        rightExists
          ? loadSide(`${rightDir}/${selectedPath}`)
          : Promise.resolve({ file: null, content: '' }),
      ]);
      setSide('left', l);
      setSide('right', r);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, leftDir, rightDir]);

  // Native Tauri drag-drop: dropping a file onto a half replaces that side.
  useEffect(() => {
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
  }, []);

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

  const [stats, setStats] = useState({ added: 0, removed: 0 });
  const diffPanelRef = useRef<DiffPanelHandle>(null);

  const leftDirty = !!left && leftContent !== left.meta.content;
  const rightDirty = !!right && rightContent !== right.meta.content;

  useUnsavedGuard(leftDirty || rightDirty);

  const reloadSide = (side: Side) => {
    const file = side === 'left' ? left : right;
    if (file) void loadSide(file.path).then((res) => setSide(side, res));
  };
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

  // Reload both files and clear the external-change notice — reused by the top header refresh button and DiffPanel.
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <AppHeader
        siderCollapsed={siderCollapsed}
        onExpandSider={onExpandSider}
        left={<Button icon={<LeftOutlined />} onClick={() => navigate('/folder-compare')} />}
        right={
          <Space size="small">
            {canDiff && (
              <>
                <Tooltip title={t('common:prevDiff')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowUpOutlined />}
                    onClick={() => diffPanelRef.current?.goPrev()}
                  />
                </Tooltip>
                <Tooltip title={t('common:nextDiff')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowDownOutlined />}
                    onClick={() => diffPanelRef.current?.goNext()}
                  />
                </Tooltip>
                <Tooltip title={t('common:findReplace')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<SearchOutlined />}
                    onClick={() => diffPanelRef.current?.toggleSearch()}
                  />
                </Tooltip>
                <Divider vertical className="mx-0.5" />
              </>
            )}
            {(left || right) && (
              <Tooltip title={t('common:refresh')}>
                <Button type="text" size="small" icon={<ReloadOutlined />} onClick={reloadAll} />
              </Tooltip>
            )}
            <Tag color="error">-{stats.removed}</Tag>
            <Tag color="success">+{stats.added}</Tag>
          </Space>
        }
      />

      <DiffPanel
        ref={diffPanelRef}
        showGlobalActions={false}
        left={left}
        right={right}
        leftContent={leftContent}
        rightContent={rightContent}
        notice={notice}
        canDiff={canDiff}
        hoverSide={hoverSide}
        onPick={pickFile}
        onChange={onChange}
        onStats={setStats}
        onSave={saveFile}
        onReload={reloadAll}
        showReload={false}
        leftDirty={leftDirty}
        rightDirty={rightDirty}
        emptyMode="pick"
      />
    </div>
  );
}
