/**
 * "Comparison rules" settings panel: diff options (ignore whitespace / ignore
 * case) + skip directories by name during folder compare (exact match at any
 * depth). Default directories (.git/node_modules/…) are shown as built-in items
 * and cannot be deleted; users can append custom entries. Writes back to
 * settings.ignoreWhitespace / ignoreCase / ignoreDirs, taking effect on the next
 * folder-compare diff.
 */
import { Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSettings, BUILTIN_IGNORE_DIRS, type Settings } from '../../settings';
import { RuleListEditor } from './rule-list-editor';

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

export function IgnoreTab() {
  const { settings, update } = useSettings();
  const { t } = useTranslation('settings');
  const set = (patch: Partial<Settings>) => update(patch);
  // User items = the current list minus the built-in items (built-ins are shown separately as non-deletable).
  const userDirs = settings.ignoreDirs.filter((d) => !BUILTIN_IGNORE_DIRS.includes(d));

  const add = (v: string) => update({ ignoreDirs: [...settings.ignoreDirs, v] });
  const remove = (v: string) => update({ ignoreDirs: settings.ignoreDirs.filter((d) => d !== v) });

  return (
    <div className="px-6 pb-8 flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-6 px-6 flex h-[54px] shrink-0 items-center bg-surface">
        <h3 className="m-0 text-xl font-semibold">{t('ignore')}</h3>
      </div>

      <div className="text-xs font-semibold text-muted mt-1">{t('compareOptions')}</div>
      <SwitchRow
        title={t('ignoreWhitespace')}
        desc={t('ignoreWhitespaceDesc')}
        checked={settings.ignoreWhitespace}
        onChange={(v) => set({ ignoreWhitespace: v })}
      />
      <SwitchRow
        title={t('ignoreCase')}
        desc={t('ignoreCaseDesc')}
        checked={settings.ignoreCase}
        onChange={(v) => set({ ignoreCase: v })}
      />

      <RuleListEditor
        title={t('ignoredDirs')}
        description={t('ignoredDirsDesc')}
        builtin={BUILTIN_IGNORE_DIRS}
        values={userDirs}
        onAdd={add}
        onRemove={remove}
        placeholder={t('ignoredDirsPlaceholder')}
      />
    </div>
  );
}
