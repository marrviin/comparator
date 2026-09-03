/**
 * Reusable "list editor": title + description + input (+ add button) + list rows.
 * Built-in items carry a gray "built-in" tag and cannot be deleted; user items
 * can be deleted. Ported from joybuddy's security-center RuleListEditor, with the
 * allow/deny tone stripped out. Used for the "ignore directories" setting.
 */
import { useState, type ReactNode } from 'react';
import { Button, Input, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { CloseOutlined } from '@ant-design/icons';

interface Props {
  title: string;
  description: ReactNode;
  /** Read-only built-in items, tagged "built-in" and non-deletable. */
  builtin?: string[];
  /** User-editable items. */
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder?: string;
}

export function RuleListEditor({
  title,
  description,
  builtin = [],
  values,
  onAdd,
  onRemove,
  placeholder,
}: Props) {
  const [draft, setDraft] = useState('');
  const { t } = useTranslation(['settings', 'common']);

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    if (!builtin.includes(v) && !values.includes(v)) onAdd(v);
    setDraft('');
  };

  return (
    <div className="rounded-xl bg-panel p-4 flex flex-col gap-3">
      <div className="text-[15px] font-semibold text-fg">{title}</div>
      <div className="text-xs text-muted -mt-1.5">{description}</div>

      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={submit}
        />
        <Button type="primary" onClick={submit} disabled={!draft.trim()}>
          {t('common:add')}
        </Button>
      </div>

      {(builtin.length > 0 || values.length > 0) && (
        <div className="flex flex-col gap-2">
          {builtin.map((v) => (
            <div
              key={`b:${v}`}
              className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2.5"
            >
              <span className="flex-1 text-[13px] text-fg font-mono">{v}</span>
              <Tag className="m-0 text-muted">{t('common:builtin')}</Tag>
            </div>
          ))}
          {values.map((v) => (
            <div
              key={`u:${v}`}
              className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2.5"
            >
              <span className="flex-1 text-[13px] text-fg font-mono">{v}</span>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => onRemove(v)}
                aria-label={t('settings:deleteItem', { name: v })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
