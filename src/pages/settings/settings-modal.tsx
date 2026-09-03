/**
 * Settings dialog (antd Modal). Settings is not a full-page route but a dialog
 * floating above the current page—opened from the sidebar gear. Switching between
 * panels is managed with component-internal useState (no nested Router, to avoid
 * conflicting with the main RouterProvider).
 *
 * container padding zeroed -> the settings shell (left menu + right content) fills
 * the dialog; body has a fixed height so the interior scrolls on its own.
 * key={initialPane} + destroyOnHidden: each open starts fresh from the target panel.
 */
import { useState } from 'react';
import { Modal } from 'antd';
import { SettingsShell } from './index';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The panel to open at (default general). */
  initialPane?: string;
}

export function SettingsModal({ open, onClose, initialPane = 'general' }: Props) {
  const [pane, setPane] = useState(initialPane);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={860}
      centered
      title={null}
      classNames={{ container: 'settings-modal-content' }}
      styles={{
        body: { height: '80vh', padding: 0, overflow: 'hidden' },
      }}
    >
      <SettingsShell key={initialPane} activeKey={pane} onChange={setPane} />
    </Modal>
  );
}
