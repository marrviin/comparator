/**
 * Tab strip shared by the folder/git compare pages — Chrome-style, rendered
 * inside AppHeader via its `tabs` slot. Tabs anchor to the bottom edge of the
 * darker strip (bg-panel-2); the active tab is opaque bg-panel (matching the
 * column-header rows below) and its concave bottom flares merge it into the
 * content area, like Chrome's tab-to-toolbar transition.
 *
 * Tab #0 is the unclosable directory-tree tab; every opened file gets a tab
 * (material file icon + basename + dirty dot) with a right-click menu
 * (close / close others / close all). All state (open tabs, active tab) lives
 * in useFileTabs on the owning page — this bar only selects/closes.
 */
import cx from 'classnames';
import { Button, Dropdown, type MenuProps } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export interface TabBarTab {
  /** Unique key: TREE_TAB_KEY or the file's relative path. */
  key: string;
  /** Display label: file basename, or the localized mode label for the tree tab. */
  label: string;
  /** Material icon URL (file icon / mode icon). */
  iconUrl: string;
  /** Tooltip, e.g. the full relative path. */
  title?: string;
  /** False only for the tree tab. */
  closable: boolean;
  /** Shows the unsaved-changes dot. */
  dirty?: boolean;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  /** TREE_TAB_KEY or the active file path. */
  activeKey: string;
  onSelect: (key: string) => void;
  /** Close handlers; pages without closable tabs (text compare) may omit them —
   * the matching context-menu entries are disabled then. */
  onClose?: (key: string) => void;
  onCloseOthers?: (key: string) => void;
  onCloseAll?: () => void;
}

export function TabBar({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAll,
}: TabBarProps) {
  const { t } = useTranslation('diff');

  // Right-click menu per tab: the tree tab disables close / close others
  // (it can never close; "close others" on it would equal close all). Pages
  // without close handlers (single-tab text compare) disable them entirely.
  const menuFor = (closable: boolean): MenuProps['items'] => [
    { key: 'close', label: t('closeTab'), disabled: !closable || !onClose },
    { key: 'closeOthers', label: t('closeOthers'), disabled: !closable || !onCloseOthers },
    { key: 'closeAll', label: t('closeAllTabs'), disabled: !onCloseAll },
  ];

  const onMenuClick = (key: string, tab: TabBarTab) => {
    if (key === 'close') onClose?.(tab.key);
    else if (key === 'closeOthers') onCloseOthers?.(tab.key);
    else if (key === 'closeAll') onCloseAll?.();
  };

  return (
    <div
      // px-3 keeps the outermost tabs' 10px bottom flares inside this scroll
      // container's padding box — without it the first/last flare is clipped
      // into a right angle. flex-1 stretches the strip past the last tab so
      // the blank area stays a window drag region (data-tauri-drag-region
      // fires on this div itself).
      className="flex flex-1 items-stretch gap-x-2 h-full min-w-0 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-tauri-drag-region
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Dropdown
            key={tab.key}
            trigger={['contextMenu']}
            menu={{
              items: menuFor(tab.closable),
              onClick: ({ key }) => onMenuClick(key, tab),
            }}
          >
            <div
              className={cx(
                // Shape/hover/separator behavior comes from .pc-tab in styles.css.
                // Tab boxes span the full header height and center their content,
                // so text sits at the header's vertical center in every state —
                // the center of the hover pill and of the active tab alike. The
                // active background (.pc-tab-bg, 36px) and hover pill (32px,
                // centered) are painted by layers behind the content. Right
                // padding follows closability (the × keeps its space even while
                // faded out), so tabs never resize when activated.
                'pc-tab flex items-center gap-1.5 h-full pl-2.5 flex-none max-w-48 text-xs cursor-pointer select-none',
                active ? 'is-active text-fg' : 'text-muted',
                tab.closable ? 'pr-1.5' : 'pr-2.5',
              )}
              title={tab.title ?? tab.label}
              onClick={() => onSelect(tab.key)}
            >
              {active ? (
                <span className="pc-tab-bg" aria-hidden />
              ) : (
                <span className="pc-tab-hover" aria-hidden />
              )}
              <img src={tab.iconUrl} className="w-4 h-4 flex-none" alt="" aria-hidden />
              <span className="flex-1 min-w-0 truncate">{tab.label}</span>
              {tab.dirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-warning flex-none"
                  title={t('dirtyTab')}
                />
              )}
              {tab.closable && (
                <Button
                  type="text"
                  size="small"
                  className="pc-tab-close flex-none h-5 w-5 min-w-0 !rounded-full"
                  icon={<CloseOutlined className="text-[10px]" />}
                  aria-label={t('closeTab')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose?.(tab.key);
                  }}
                />
              )}
            </div>
          </Dropdown>
        );
      })}
    </div>
  );
}
