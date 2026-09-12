/**
 * Settings shell: left icon menu + right content area (modeled on joybuddy's
 * settings). Panel switching is managed with a controlled activeKey + onChange
 * (no nested Router, to avoid conflicting with the main RouterProvider).
 */
import { type ComponentType, createElement } from 'react';
import { Menu } from 'antd';
import { useTranslation } from 'react-i18next';
import { SettingOutlined, DiffOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { GeneralTab } from './general';
import { IgnoreTab } from './ignore';
import { AboutTab } from './about';

type IconComp = ComponentType;
const TABS: { key: string; labelKey: string; icon: IconComp }[] = [
  { key: 'general', labelKey: 'general', icon: SettingOutlined },
  { key: 'ignore', labelKey: 'ignore', icon: DiffOutlined },
  { key: 'about', labelKey: 'about', icon: InfoCircleOutlined },
];

export { GeneralTab, IgnoreTab };

interface SettingsShellProps {
  /** The currently active panel key. */
  activeKey: string;
  /** Switch panels. */
  onChange: (key: string) => void;
}

export function SettingsShell({ activeKey, onChange }: SettingsShellProps) {
  const { t } = useTranslation('settings');
  const active = TABS.some((t) => t.key === activeKey) ? activeKey : 'general';

  return (
    <div className="flex h-full overflow-hidden [&>*]:min-h-0 [&>*]:min-w-0">
      {/* Left icon menu: uses antd Menu (controlled selectedKeys), rounded selected block.
          No background here — the modal panel carries the frosted-glass layer (.pc-glass-modal). */}
      <nav className="w-[220px] shrink-0 h-full overflow-auto border-r border-line px-2 py-4">
        <Menu
          mode="inline"
          selectedKeys={[active]}
          onClick={({ key }) => onChange(key)}
          className="!border-e-0 !bg-transparent"
          items={TABS.map((tab) => ({
            key: tab.key,
            icon: createElement(tab.icon),
            label: t(tab.labelKey),
          }))}
        />
      </nav>

      {/* Right content area (white background), each panel carries its own large title; this only handles scrolling. */}
      <div className="relative flex-1 min-w-0 h-full">
        <div className="h-full min-h-0 min-w-0 overflow-auto pr-11">
          {active === 'ignore' ? <IgnoreTab /> : active === 'about' ? <AboutTab /> : <GeneralTab />}
        </div>
      </div>
    </div>
  );
}
