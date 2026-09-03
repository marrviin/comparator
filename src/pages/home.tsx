/**
 * Home route: the session picker. Dropping files onto the page jumps straight
 * into the text-compare route with the dropped paths passed through router
 * state (folder/git use explicit pickers on their own routes).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import { useNavigate } from 'react-router-dom';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { invoke } from '@tauri-apps/api/core';
import { Card, Modal, Input, Empty, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { RetweetOutlined, SearchOutlined } from '@ant-design/icons';
import { Welcome } from '@ant-design/x';
import { AppHeader } from '../app-header';
import { useShell } from '../layout';
import { materialIconUrlByName, materialIconUrl } from '../material-icons';
import { basename, HistoryEntry, entryKey, useStaleHistory } from '../history';
import icon from '../assets/icon.png';

/** Colored material-icon-theme icon (about 28px) used by the home cards. */
function CardIcon({ name }: { name: string }) {
  return (
    <img
      className="inline-block w-7 h-7 object-contain select-none"
      src={materialIconUrlByName(name)}
      alt=""
      aria-hidden
      draggable={false}
    />
  );
}

// The onboarding tour now lives in layout (permanently mounted); the home page only provides anchors via data-tour attributes.

/** Session cards; titles/descriptions are resolved via i18n at render time (titleKey/descKey). */
const SESSIONS = [
  { key: 'text', titleKey: 'textTitle', descKey: 'textDesc', icon: 'document', enabled: true },
  {
    key: 'folder',
    titleKey: 'folderTitle',
    descKey: 'folderDesc',
    icon: 'folder-base-open',
    enabled: true,
  },
  { key: 'git', titleKey: 'gitTitle', descKey: 'gitDesc', icon: 'git', enabled: true },
];

/** Map a session card key to its route path. */
function pathFor(key: string): string {
  return key === 'folder' ? '/folder-compare' : key === 'git' ? '/git-compare' : '/text-compare';
}

/** A single history row: icon + "left name ⇄ right name" (git prefixes the repo name); the click callback opens the comparison.
 *  When stale=true (the path no longer exists) the whole row is greyed out with a tooltip, but stays clickable (the target page reports the error). */
function RecentRow({
  entry,
  onOpen,
  stale = false,
}: {
  entry: HistoryEntry;
  onOpen: () => void;
  stale?: boolean;
}) {
  const { t } = useTranslation('home');
  return (
    <Tooltip title={stale ? t('stalePath') : undefined}>
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          'flex items-center gap-2 w-full px-2.5 py-2 rounded-md bg-transparent border-0 cursor-pointer text-left transition-colors hover:bg-hover',
          stale && 'opacity-45',
        )}
      >
        <img
          className="w-4 h-4 object-contain select-none flex-none"
          src={
            entry.kind === 'git'
              ? materialIconUrlByName('git')
              : entry.kind === 'folder'
                ? materialIconUrlByName('folder-base-open')
                : materialIconUrl(entry.leftName, 'document')
          }
          alt=""
          aria-hidden
          draggable={false}
        />
        <span className="flex-1 min-w-0 flex items-center gap-1 text-sm truncate">
          {entry.kind === 'git' && entry.repo && <span>{basename(entry.repo)}:</span>}
          <span className="truncate">{entry.leftName}</span>
          <RetweetOutlined className="text-muted text-[12px] flex-none" />
          <span className="truncate">{entry.rightName}</span>
        </span>
      </button>
    </Tooltip>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation('home');
  const { siderCollapsed, onExpandSider, recent: allRecentRaw } = useShell();
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const navRef = useRef(navigate);
  navRef.current = navigate;

  // Recent comparisons come from the shell's live state (single source of truth shared
  // with the sidebar), so deleting an entry there updates the home page immediately.
  // Home shows the 5 most recently opened (sorted by ts descending).
  const recent = allRecentRaw
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5);
  // Clicking a recent comparison: navigate to the matching route by kind, passing the left/right paths/refs through to the target page.
  function openRecent(entry: (typeof recent)[number]) {
    navigate(
      entry.kind === 'git'
        ? '/git-compare'
        : entry.kind === 'folder'
          ? '/folder-compare'
          : '/text-compare',
      {
        state:
          entry.kind === 'git'
            ? { repo: entry.repo, from: entry.left, to: entry.right }
            : { left: entry.left, right: entry.right },
      },
    );
  }

  // Full history (descending); the "More" modal shows everything and supports search filtering.
  const [moreOpen, setMoreOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const allRecent = useMemo(() => allRecentRaw.slice().sort((a, b) => b.ts - a.ts), [allRecentRaw]);
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return allRecent;
    return allRecent.filter((e) =>
      [e.leftName, e.rightName, e.left, e.right, e.repo ?? ''].join(' ').toLowerCase().includes(kw),
    );
  }, [allRecent, keyword]);

  // Open a comparison and close the "More" modal.
  function openFromMore(entry: HistoryEntry) {
    setMoreOpen(false);
    openRecent(entry);
  }

  // Check which history entries have stale paths (grey out + tooltip). Validate the full list when the modal is open, otherwise only the 5 on the home page.
  const stale = useStaleHistory(moreOpen ? allRecent : recent);

  // Native Tauri drag-drop on the home screen: while hovering we just highlight
  // the drop area; on drop we inspect the actual path types and route by kind —
  // directories go into folder-compare, plain files go into text-compare.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === 'over') {
          setHoverKey('drop');
        } else if (p.type === 'drop') {
          setHoverKey(null);
          const paths = p.paths.filter(Boolean);
          if (paths.length === 0) return;
          void routeByKind(paths);
        } else {
          setHoverKey(null);
        }
      })
      .then((fn) => {
        // If the component unmounted before the listener finished registering, unregister immediately to avoid a listener leak.
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Look up whether the dropped paths are directories or files, then route:
  //   - any directory present  -> folder-compare (first two dirs as left/right)
  //   - otherwise (files only)  -> text-compare
  async function routeByKind(paths: string[]) {
    try {
      const kinds = await Promise.all(paths.map((path) => invoke<string>('path_kind', { path })));
      const dirs = paths.filter((_, i) => kinds[i] === 'dir');
      const files = paths.filter((_, i) => kinds[i] === 'file');
      if (dirs.length > 0) {
        navRef.current('/folder-compare', {
          state: dirs.length >= 2 ? { left: dirs[0], right: dirs[1] } : { left: dirs[0] },
        });
        return;
      }
      navRef.current('/text-compare', {
        state: files.length >= 2 ? { left: files[0], right: files[1] } : { left: files[0] },
      });
    } catch {
      // Fall back to text-compare if type detection fails.
      navRef.current('/text-compare', {
        state: paths.length >= 2 ? { left: paths[0], right: paths[1] } : { left: paths[0] },
      });
    }
  }

  const dragging = hoverKey === 'drop';

  return (
    <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
      <AppHeader siderCollapsed={siderCollapsed} onExpandSider={onExpandSider} bordered={false} />
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-7 p-4 sm:p-8">
        <div data-tour="home-welcome" className="mb-4">
          <Welcome
            title="Pure Compare"
            icon={<img src={icon} alt="" />}
            description={t('description')}
            variant="borderless"
          />
        </div>

        <div
          data-tour="home-cards"
          className="w-full max-w-[760px] grid gap-4 justify-center grid-cols-[repeat(auto-fit,minmax(140px,1fr))]"
        >
          {SESSIONS.map((s) => (
            <Card
              key={s.key}
              hoverable={false}
              data-session={s.key}
              className={cx(
                'cursor-pointer text-center transition-transform',
                !s.enabled && 'opacity-50 cursor-not-allowed',
              )}
              onClick={s.enabled ? () => navigate(pathFor(s.key)) : undefined}
              size="small"
            >
              <div className={cx('text-[28px]', s.enabled ? 'text-accent' : 'text-muted')}>
                <CardIcon name={s.icon} />
              </div>
              <div className="mt-2 text-sm font-semibold">{t(s.titleKey)}</div>
              <div className="text-xs text-muted">{t(s.descKey)}</div>
            </Card>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="w-full max-w-[760px] mt-8">
            <div className="mb-2 px-1 text-xs font-semibold text-muted">{t('recentCompare')}</div>
            <div className="flex flex-col gap-1">
              {recent.map((e) => (
                <RecentRow
                  key={entryKey(e)}
                  entry={e}
                  onOpen={() => openRecent(e)}
                  stale={stale.has(entryKey(e))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setMoreOpen(true);
              }}
              className="mt-1 w-full text-left text-sm text-accent bg-transparent border-0 cursor-pointer px-2.5 py-2 rounded-md transition-colors hover:bg-hover"
            >
              {t('more')}
            </button>
          </div>
        )}
      </div>

      <Modal
        title={t('allCompare')}
        open={moreOpen}
        onCancel={() => setMoreOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Input
          allowClear
          autoFocus
          prefix={<SearchOutlined className="text-muted" />}
          placeholder={t('searchPlaceholder')}
          value={keyword}
          onChange={(ev) => setKeyword(ev.target.value)}
        />
        <div className="mt-3 max-h-[50vh] overflow-auto flex flex-col gap-1">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('noMatch')} />
            </div>
          ) : (
            filtered.map((e) => (
              <RecentRow
                key={entryKey(e)}
                entry={e}
                onOpen={() => openFromMore(e)}
                stale={stale.has(entryKey(e))}
              />
            ))
          )}
        </div>
      </Modal>

      {/* Full-page drop highlight: the drop target is the whole window, so a full-page overlay is used, matching the copy. */}
      {dragging && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-accent-bg/70 border-2 border-dashed border-accent pointer-events-none">
          <div className="text-base font-medium text-accent">{t('dropToStart')}</div>
        </div>
      )}
    </div>
  );
}
