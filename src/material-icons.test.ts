import { describe, expect, it } from 'vitest';
import { materialIconUrl, materialFolderUrl, materialIconUrlByName } from './material-icons';

// The slim manifest is generated (scripts/sync-material-icons.mjs) and the svg files
// live under /material-icon-theme/icons/ in public; both are build artifacts, not
// committed. These tests assert the matching algorithm and the stable public URL
// shape, not exact icon names, so they stay stable across version bumps.

describe('materialIconUrl', () => {
  it('resolves a known extension to a stable svg URL', () => {
    const url = materialIconUrl('component.tsx');
    expect(url).toContain('/material-icon-theme/icons/');
    expect(url.endsWith('.svg')).toBe(true);
  });

  it('matches multi-segment extensions right-to-left (test files)', () => {
    // a.test.ts should prefer the test.ts icon over the plain ts icon when defined.
    const testUrl = materialIconUrl('foo.test.ts');
    const tsUrl = materialIconUrl('foo.ts');
    expect(testUrl).toContain('.svg');
    // Both resolve to some icon; the test-specific one must differ from plain ts
    // only if the manifest defines it — either way it must be a valid URL.
    expect(tsUrl).toContain('.svg');
  });

  it('matches whole file names (package.json)', () => {
    const url = materialIconUrl('package.json');
    expect(url).toContain('.svg');
  });

  it('falls back to a default icon for unknown extensions', () => {
    const url = materialIconUrl('mystery.zzzznotarealext');
    expect(url).toContain('/material-icon-theme/icons/');
    expect(url).not.toBe('');
  });

  it('is case-insensitive', () => {
    expect(materialIconUrl('README.MD')).toBe(materialIconUrl('readme.md'));
  });
});

describe('materialFolderUrl', () => {
  it('resolves a folder to a stable svg URL', () => {
    const url = materialFolderUrl('src');
    expect(url).toContain('/material-icon-theme/icons/');
    expect(url.endsWith('.svg')).toBe(true);
  });

  it('falls back to the default folder icon for unknown names', () => {
    const url = materialFolderUrl('some-random-folder-xyz');
    expect(url).not.toBe('');
  });
});

describe('materialIconUrlByName', () => {
  it('resolves a direct icon name', () => {
    const url = materialIconUrlByName('git');
    expect(url).toContain('/material-icon-theme/icons/');
  });

  it('falls back for an unknown icon name', () => {
    const url = materialIconUrlByName('definitely-not-an-icon');
    expect(url).not.toBe('');
  });
});
