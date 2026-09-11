/**
 * Shared top header for all views: unified height, padding, divider, and
 * draggable window region.
 *   - When the sidebar is collapsed, renders an "expand sidebar" button on the
 *     far left and reserves space for the native macOS traffic-light buttons so
 *     buttons/icons are not obscured by the window controls;
 *   - Uses the left / right slots to host each page's own back button, action
 *     area, and stats;
 *   - The whole header is draggable to move the window; interactive elements
 *     mark themselves no-drag.
 */
import { ReactNode } from 'react';
import cx from 'classnames';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { SidebarToggleSvg } from './icons';

interface AppHeaderProps {
  /** Whether the sidebar is collapsed—when collapsed, renders the expand button + traffic-light spacer. */
  siderCollapsed: boolean;
  /** Callback for clicking the expand button. */
  onExpandSider: () => void;
  /** Left content (back button, repo selector, etc.), placed after the expand button. */
  left?: ReactNode;
  /** Right content (stats Tag, etc.); when present the header uses space-between alignment. */
  right?: ReactNode;
  /**
   * Optional tab strip (folder/git compare), rendered between left and right
   * Chrome-style. When present the header becomes the darker tab strip
   * (bg-panel-2, like Chrome's titlebar) with no bottom divider: the strip's
   * color boundary against the lighter content below replaces the line, and
   * the active tab's concave bottom flares bridge the two.
   */
  tabs?: ReactNode;
  /** Whether to show the bottom divider, shown by default; views like the home page that need no divider can disable it. */
  bordered?: boolean;
}

export function AppHeader({
  siderCollapsed,
  onExpandSider,
  left,
  right,
  tabs,
  bordered = true,
}: AppHeaderProps) {
  const { t } = useTranslation('layout');
  return (
    <header
      className={cx(
        'flex items-center h-12 flex-none',
        tabs ? 'bg-panel-2' : bordered && 'border-b border-line',
      )}
      data-tauri-drag-region
    >
      {/* Traffic-light spacer + expand button: transitions width in sync with the
          sidebar's 200ms animation rather than appearing/disappearing instantly,
          avoiding the header's left content jumping or the icon popping in abruptly
          during the expand animation. Width is 99px when collapsed (64 traffic-light
          spacer + 28 button + gap), and collapses to 0 when expanded. */}
      <div
        className="flex-none flex items-center self-stretch overflow-hidden transition-[width] duration-200 ease-in-out [-webkit-app-region:no-drag]"
        style={{ width: siderCollapsed ? 108 : 0, marginLeft: siderCollapsed ? '6px' : 0 }}
        aria-hidden={!siderCollapsed}
        data-tauri-drag-region
      >
        <div className="flex-none w-[80px] self-stretch" data-tauri-drag-region />
        <button
          type="button"
          aria-label={t('expandSider')}
          tabIndex={siderCollapsed ? 0 : -1}
          className="flex-none text-[14px] flex items-center justify-center w-7 h-7 rounded-md text-muted bg-transparent border-0 cursor-pointer transition-colors hover:bg-hover"
          onClick={onExpandSider}
        >
          <SidebarToggleSvg />
        </button>
      </div>
      <div className="flex items-center gap-3 [-webkit-app-region:no-drag]">{left}</div>
      {tabs && (
        // Tab strip fills the middle; the empty trailing space stays a drag
        // region for the window. Side padding lives INSIDE the TabBar's scroll
        // container so the outermost tabs' bottom flares are not clipped.
        <div className="flex-1 min-w-0 self-stretch flex">{tabs}</div>
      )}
      {right && (
        <div className="ml-auto flex items-center [-webkit-app-region:no-drag]">{right}</div>
      )}
    </header>
  );
}
