/**
 * "About" settings panel: app icon, name and version, a feedback button, and a
 * footer with the repo link + copyright. Version comes from the Tauri runtime
 * (tauri.conf.json) via getVersion(); external links open in the system browser
 * via the opener plugin.
 */
import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from 'antd';
import { GithubOutlined, MessageOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import icon from '../../assets/icon.png';

const GITHUB_URL = 'https://github.com/marrviin/pure-compare';
const FEEDBACK_URL = `${GITHUB_URL}/issues/new`;

export function AboutTab() {
  const { t } = useTranslation('settings');
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(''));
  }, []);

  return (
    // min-h-full + mt-auto: pin the footer to the bottom of the visible panel
    // (the panel content area is the scroll container).
    <div className="min-h-full flex flex-col">
      <div className="flex flex-col items-center gap-3 py-14">
        <img
          src={icon}
          alt="Pure Compare"
          className="w-20 h-20 rounded-xl object-contain select-none"
          draggable={false}
        />
        <div className="text-lg font-semibold text-fg">Pure Compare</div>
        {version && <div className="text-xs text-muted">v{version}</div>}
        <Button
          icon={<MessageOutlined />}
          className="mt-2"
          onClick={() => void openUrl(FEEDBACK_URL)}
        >
          {t('feedback')}
        </Button>
      </div>

      {/* Footer: repo link + copyright. */}
      <div className="mt-auto flex flex-col items-center gap-1.5 pb-2">
        <button
          type="button"
          className="flex items-center gap-1.5 text-[12px] text-muted bg-transparent border-0 cursor-pointer transition-colors hover:text-accent"
          onClick={() => void openUrl(GITHUB_URL)}
        >
          <GithubOutlined />
          <span>github.com/marrviin/pure-compare</span>
        </button>
        <span className="text-[11px] text-muted select-none">
          © {new Date().getFullYear()} marrviin
        </span>
      </div>
    </div>
  );
}
