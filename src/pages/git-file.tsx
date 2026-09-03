/**
 * Git comparison detail page. Opens the file selected in the git tree as a full
 * side-by-side diff. Each side loads its content via `git_show` at that side's
 * ref; ref snapshots are read-only, while the working-tree side (if either ref
 * is WORKTREE) is a real disk file that can be edited, saved, and watched.
 *
 * Because this is now a real route (not internal state), useUnsavedGuard blocks
 * the back navigation when the working-tree side has unsaved edits.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Button, Divider, Space, Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  LeftOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { DiffPanel, DiffPanelHandle, FileContent, LoadedFile, Side } from '../diff-view';
import { AppHeader } from '../app-header';
import { useFileWatch } from '../use-file-watch';
import { useUnsavedGuard } from '../use-unsaved-guard';
import { useGit, WORKTREE, toRev } from './git-compare';

export function GitFilePage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['diff', 'common', 'git']);
  const { setError, siderCollapsed, onExpandSider, repo, from, to, entries, selectedPath } =
    useGit();

  const [left, setLeft] = useState<LoadedFile | null>(null);
  const [right, setRight] = useState<LoadedFile | null>(null);
  const [leftContent, setLeftContent] = useState('');
  const [rightContent, setRightContent] = useState('');

  // No file / repo (deep-linked or refreshed) — bounce back to the tree.
  useEffect(() => {
    if (!selectedPath || !repo || !from) navigate('/git-compare', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSide(
    rev: string,
    path: string,
    exists: boolean,
  ): Promise<{ file: LoadedFile | null; content: string }> {
    if (!exists || !repo) return { file: null, content: '' };
    const label = rev === WORKTREE ? t('git:worktree') : rev;
    try {
      const meta = await invoke<FileContent>('git_show', {
        repo: repo.root,
        rev: toRev(rev),
        path,
      });
      return {
        file: { path: `${label}:${path}`, meta, label: `${label} · ${path}` },
        content: meta.content,
      };
    } catch {
      return { file: null, content: '' };
    }
  }

  // Load both sides' content for the selected file (on mount / when the selection changes).
  async function openFile(path: string) {
    if (!repo || !from) return;
    const entry = entries.find((e) => e.path === path);
    const leftExists = entry ? entry.status !== 'added' : true;
    const rightExists = entry ? entry.status !== 'removed' : true;
    const [l, r] = await Promise.all([
      loadSide(from, path, leftExists),
      loadSide(to, path, rightExists),
    ]);
    setLeft(l.file);
    setRight(r.file);
    setLeftContent(l.content);
    setRightContent(r.content);
  }

  useEffect(() => {
    if (selectedPath && repo && from) void openFile(selectedPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

  const canDiff =
    !!(left || right) &&
    !(left?.meta.is_binary || right?.meta.is_binary) &&
    !(left?.meta.truncated || right?.meta.truncated);

  const [stats, setStats] = useState({ added: 0, removed: 0 });
  const diffPanelRef = useRef<DiffPanelHandle>(null);

  const leftReadonly = from !== WORKTREE;
  const rightReadonly = to !== WORKTREE;
  const leftDirty = !!left && !leftReadonly && leftContent !== left.meta.content;
  const rightDirty = !!right && !rightReadonly && rightContent !== right.meta.content;

  // Intercept route navigation when there are unsaved changes (controlled by the setting) -- this only truly fires after the real-router refactor.
  useUnsavedGuard(leftDirty || rightDirty);

  // Only the working-tree side is a real file on disk and can be watched for external changes; the ref-snapshot side isn't watched.
  const worktreeSide: Side | null = from === WORKTREE ? 'left' : to === WORKTREE ? 'right' : null;
  const worktreeDirty =
    worktreeSide === 'left' ? leftDirty : worktreeSide === 'right' ? rightDirty : false;
  const watch = useFileWatch({
    path: selectedPath && worktreeSide ? `${repo?.root ?? ''}/${selectedPath}` : null,
    dirty: worktreeDirty,
    onReload: () => selectedPath && void openFile(selectedPath),
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
    if (!repo || !selectedPath) return;
    const rev = side === 'left' ? from : to;
    if (rev !== WORKTREE) return; // ref snapshots are read-only
    const content = side === 'left' ? leftContent : rightContent;
    const path = `${repo.root}/${selectedPath}`;
    setError('');
    try {
      await invoke<number | null>('write_text_file', { path, content });
      // After saving, reload this side to refresh meta.content and clear the dirty flag.
      if (selectedPath) void openFile(selectedPath);
    } catch (e) {
      setError(String(e));
    }
  }

  // Reload the selected file and clear the external-change prompt -- reused by the top header's refresh button and DiffPanel.
  function reloadAll() {
    if (selectedPath) void openFile(selectedPath);
    watch.dismiss();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <AppHeader
        siderCollapsed={siderCollapsed}
        onExpandSider={onExpandSider}
        left={<Button icon={<LeftOutlined />} onClick={() => navigate('/git-compare')} />}
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
        onChange={onChange}
        onStats={setStats}
        onSave={saveFile}
        onReload={reloadAll}
        showReload={false}
        leftDirty={leftDirty}
        rightDirty={rightDirty}
        leftReadonly={leftReadonly}
        rightReadonly={rightReadonly}
        emptyMode="hint"
      />
    </div>
  );
}
