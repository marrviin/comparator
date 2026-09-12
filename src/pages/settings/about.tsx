/**
 * "About" settings panel: app icon, name and version. Version comes from the
 * Tauri runtime (tauri.conf.json) via getVersion().
 */
import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { GithubOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import icon from '../../assets/icon.png';

const GITHUB_URL = 'https://github.com/marrviin/pure-compare';

export function AboutTab() {
  const { t } = useTranslation('settings');
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(''));
  }, []);

  return (
    <div className="px-6 pb-8 flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-6 px-6 flex h-[54px] shrink-0 items-center bg-surface">
        <h3 className="m-0 text-xl font-semibold">{t('about')}</h3>
      </div>

      <div className="flex flex-col items-center gap-3 py-14">
        <img
          src={icon}
          alt="Pure Compare"
          className="w-20 h-20 rounded-xl object-contain select-none"
          draggable={false}
        />
        <div className="text-lg font-semibold text-fg">Pure Compare</div>
        {version && <div className="text-xs text-muted">v{version}</div>}
        {/* GitHub repo link: opens in the system browser via the opener plugin. */}
        <button
          type="button"
          className="mt-2 flex items-center gap-1.5 text-[13px] text-muted bg-transparent border-0 cursor-pointer transition-colors hover:text-accent"
          onClick={() => void openUrl(GITHUB_URL)}
        >
          <GithubOutlined />
          <span>{GITHUB_URL.replace('https://', '')}</span>
        </button>
      </div>
    </div>
  );
}
