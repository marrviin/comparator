/**
 * Guard against leaving with unsaved changes (issue 8). When there is dirty state and the
 * confirmOnUnsaved setting is on, intercept in-app route navigation and show an antd confirm
 * dialog: confirm to proceed (discard changes), cancel to stay on the current page.
 *
 * The blocker only fires when the pathname changes, so switching file tabs inside the
 * folder/git compare pages (which only changes the `file` search param) passes through
 * without a prompt — that is correct, because every tab pane stays mounted and nothing
 * is lost. The compare pages hoist one call with "any tab dirty" as the flag.
 *
 * Uses react-router's useBlocker (only available with a data router; this project uses
 * createBrowserRouter, which qualifies). Window close (Tauri native) is not handled here --
 * saving is already an explicit action, and intercepting native close requires a separate
 * window event, which is out of scope here.
 */
import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSettings } from './settings';

/** When dirty is true and the setting is on, intercept route navigation and show a confirmation. */
export function useUnsavedGuard(dirty: boolean) {
  const { settings } = useSettings();
  const { t } = useTranslation('diff');
  const active = dirty && settings.confirmOnUnsaved;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    Modal.confirm({
      title: t('unsavedTitle'),
      content: t('unsavedContent'),
      okText: t('unsavedLeave'),
      okType: 'danger',
      cancelText: t('unsavedStay'),
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    });
  }, [blocker, t]);
}
