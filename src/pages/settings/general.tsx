/**
 * "General" settings panel: language + safety switches (unsaved-changes guard /
 * file watching). One row each: title + description on the left, antd Switch on
 * the right. Writes back via useSettings.
 */
import { Select, Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSettings, type Settings, type ThemeSetting } from '../../settings';
import type { LangSetting } from '../../i18n';

/** A single-row switch setting item. */
function SwitchRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-fg">{title}</div>
        <div className="text-xs text-muted mt-0.5">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

export function GeneralTab() {
  const { settings, update } = useSettings();
  const { t } = useTranslation('settings');
  const set = (patch: Partial<Settings>) => update(patch);

  return (
    <div className="px-6 pb-8 flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-6 px-6 flex h-[54px] shrink-0 items-center">
        <h3 className="m-0 text-md font-semibold">{t('general')}</h3>
      </div>

      <div className="text-xs font-semibold text-muted mt-1">{t('appearanceGroup')}</div>
      <div className="flex items-center justify-between gap-4 rounded-lg bg-surface px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-fg">{t('theme')}</div>
          <div className="text-xs text-muted mt-0.5">{t('themeDesc')}</div>
        </div>
        <Select<ThemeSetting>
          value={settings.theme}
          onChange={(v) => set({ theme: v })}
          className="w-[140px]"
          options={[
            { value: 'system', label: t('followSystem') },
            { value: 'light', label: t('themeLight') },
            { value: 'dark', label: t('themeDark') },
          ]}
        />
      </div>

      <div className="text-xs font-semibold text-muted mt-2">{t('languageGroup')}</div>
      <div className="flex items-center justify-between gap-4 rounded-lg bg-surface px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-fg">{t('interfaceLanguage')}</div>
          <div className="text-xs text-muted mt-0.5">{t('interfaceLanguageDesc')}</div>
        </div>
        <Select<LangSetting>
          value={settings.language}
          onChange={(v) => set({ language: v })}
          className="w-[140px]"
          options={[
            { value: 'system', label: t('followSystem') },
            { value: 'zh-CN', label: t('chinese') },
            { value: 'en', label: t('english') },
          ]}
        />
      </div>

      <div className="text-xs font-semibold text-muted mt-2">{t('editSafety')}</div>
      <SwitchRow
        title={t('confirmUnsaved')}
        desc={t('confirmUnsavedDesc')}
        checked={settings.confirmOnUnsaved}
        onChange={(v) => set({ confirmOnUnsaved: v })}
      />
      <SwitchRow
        title={t('watchFiles')}
        desc={t('watchFilesDesc')}
        checked={settings.watchFiles}
        onChange={(v) => set({ watchFiles: v })}
      />
    </div>
  );
}
