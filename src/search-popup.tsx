/**
 * Find / replace popup (antd components, modern flat style). Invoked by the magnifier button in the
 * column-header toolbar; drives MonacoPanel's search state (Monaco handles highlighting and positioning,
 * the UI is all drawn here).
 *
 * A non-modal (mask=false) overlay placed at the top-right of the diff panel: it doesn't interrupt editing,
 * so you can view results and tweak the query at the same time. Typing highlights in real time (setQuery),
 * Enter = next, with support for case / whole-word / regex, plus replace / replace all.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Space, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined, SwapOutlined } from '@ant-design/icons';
import type { MergePanelHandle, SearchOptions } from './monaco-panel';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Command handle for the target diff panel. */
  target: React.RefObject<MergePanelHandle | null>;
  /** Hide the replace area in a read-only comparison (neither side is writable). */
  replaceDisabled?: boolean;
}

/** The three toggles (Aa case / |ab| whole word / .* regex) unified into small square buttons. */
function Toggle({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <Tooltip title={title}>
      <Button
        size="small"
        type={active ? 'primary' : 'text'}
        className="min-w-7 font-mono text-[12px]"
        onClick={onClick}
      >
        {label}
      </Button>
    </Tooltip>
  );
}

export function SearchPopup({ open, onClose, target, replaceDisabled = false }: Props) {
  const { t } = useTranslation('diff');
  const [query, setQueryText] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regexp, setRegexp] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof Input>>(null);

  // Focus the search box on open, so you can type right away.
  useEffect(() => {
    if (open) inputRef.current?.focus({ cursor: 'all' });
  }, [open]);

  // Esc to close (bound on the popup container, so it fires even while the input is focused).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  // Query changes -> sync to the editor in real time (highlight all matches).
  useEffect(() => {
    if (!open) return;
    const opts: SearchOptions = { search: query, replace, caseSensitive, regexp, wholeWord };
    target.current?.setQuery(opts);
  }, [open, query, replace, caseSensitive, regexp, wholeWord, target]);

  if (!open) return null;

  return (
    <div
      className="absolute top-2 right-3 z-20 w-95 rounded-lg border border-line bg-surface shadow-lg [-webkit-app-region:no-drag]"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-start gap-1 p-2">
        <Tooltip title={showReplace ? t('collapseReplace') : t('expandReplace')}>
          <Button
            type="text"
            size="small"
            className="flex-none mt-0.5"
            icon={<SwapOutlined rotate={90} />}
            onClick={() => setShowReplace((s) => !s)}
            disabled={replaceDisabled}
          />
        </Tooltip>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {/* Find row */}
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              size="small"
              placeholder={t('find')}
              value={query}
              onChange={(e) => setQueryText(e.target.value)}
              onPressEnter={(e) => {
                if (e.shiftKey) target.current?.findPrev();
                else target.current?.findNext();
              }}
              suffix={
                <Space size={2}>
                  <Toggle
                    active={caseSensitive}
                    label="Aa"
                    title={t('caseSensitive')}
                    onClick={() => setCaseSensitive((v) => !v)}
                  />
                  <Toggle
                    active={wholeWord}
                    label="ab"
                    title={t('wholeWord')}
                    onClick={() => setWholeWord((v) => !v)}
                  />
                  <Toggle
                    active={regexp}
                    label=".*"
                    title={t('regexp')}
                    onClick={() => setRegexp((v) => !v)}
                  />
                </Space>
              }
            />
            <Tooltip title={t('prevMatch')}>
              <Button
                type="text"
                size="small"
                className="flex-none"
                icon={<ArrowUpOutlined />}
                onClick={() => target.current?.findPrev()}
              />
            </Tooltip>
            <Tooltip title={t('nextMatch')}>
              <Button
                type="text"
                size="small"
                className="flex-none"
                icon={<ArrowDownOutlined />}
                onClick={() => target.current?.findNext()}
              />
            </Tooltip>
          </div>

          {/* Replace row */}
          {showReplace && !replaceDisabled && (
            <div className="flex items-center gap-1">
              <Input
                size="small"
                placeholder={t('replaceWith')}
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                onPressEnter={() => target.current?.replaceNext()}
              />
              <Tooltip title={t('replace')}>
                <Button
                  size="small"
                  className="flex-none"
                  onClick={() => target.current?.replaceNext()}
                >
                  {t('replace')}
                </Button>
              </Tooltip>
              <Tooltip title={t('replaceAll')}>
                <Button
                  size="small"
                  className="flex-none"
                  onClick={() => target.current?.replaceAll()}
                >
                  {t('replaceAll')}
                </Button>
              </Tooltip>
            </div>
          )}
        </div>

        <Tooltip title={t('close')}>
          <Button
            type="text"
            size="small"
            className="flex-none mt-0.5"
            icon={<CloseOutlined />}
            onClick={onClose}
          />
        </Tooltip>
      </div>
    </div>
  );
}
