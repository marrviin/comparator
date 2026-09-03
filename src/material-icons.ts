/**
 * Material Icon Theme icon resolution.
 *
 * Resources come from the npm package `material-icon-theme` (MIT). This package is essentially a VSCode extension;
 * the web usage described in its README is: the svgs live in the package's `icons/` directory, paired with
 * `generateManifest()` to obtain the mapping used to display icons.
 *
 * Based on this, at build time (scripts/sync-material-icons.mjs, triggered by predev/prebuild) we produce two
 * git-ignored resources:
 *   - public/material-icon-theme/icons/*.svg: all color icons; Vite treats them as plain static assets, downloaded on demand by the browser.
 *   - src/assets/material-icon-theme/material-icons.json: the trimmed-down official mapping manifest.
 *
 * The matching algorithm is the same as VSCode: exact file name match → right-to-left multi-segment extension match → default file icon.
 */

/** The fields we use from the manifest (the manifest also has light/highContrast etc., unused here). */
interface IconManifest {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  /** Default file icon name */
  file: string;
  /** Icon mapping for specific folder names (e.g. src, node_modules) */
  folderNames: Record<string, string>;
  /** Default folder icon name */
  folder: string;
}

// Imported with ?raw: this both avoids TS inferring the manifest into a giant literal type (which slows down typecheck),
// and frees tsc from depending on this "generated at build time, not in git" json actually existing (?raw's type is always string).
import manifestRaw from './assets/material-icon-theme/material-icons.json?raw';

const manifest = JSON.parse(manifestRaw) as IconManifest;

// The svgs are copied to public by the sync script; Vite exposes them verbatim at this path.
const ICON_BASE = '/material-icon-theme/icons/';

/** Resolve a Material icon name from a file name. */
function iconNameFor(name: string, fallback: string = manifest.file): string {
  const lower = name.toLowerCase();

  // Full name takes priority (e.g. package.json, dockerfile, .gitignore)
  const byName = manifest.fileNames[lower];
  if (byName) return byName;

  // Match multi-segment extensions right-to-left (e.g. a.test.ts → test.ts → ts)
  const parts = lower.split('.');
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join('.');
    const byExt = manifest.fileExtensions[ext];
    if (byExt) return byExt;
  }

  return fallback;
}

/**
 * Resolve an accessible URL for a file icon; falls back to the specified default icon (defaults to file) when not found.
 * @param name file name (including extension)
 * @param fallback icon name to use when no type matches, defaults to manifest.file
 */
export function materialIconUrl(name: string, fallback: string = manifest.file): string {
  return urlForIconName(iconNameFor(name, fallback));
}

/**
 * Resolve an accessible URL directly by Material icon name (e.g. document, folder, git).
 * For fixed-icon scenarios like the sidebar; does not go through file name/extension matching.
 */
export function materialIconUrlByName(iconName: string): string {
  return urlForIconName(iconName);
}

/** Resolve an accessible URL from an icon name; falls back to the default file icon when not found. */
function urlForIconName(iconName: string): string {
  const def = manifest.iconDefinitions[iconName] ?? manifest.iconDefinitions[manifest.file];
  const fileName = def?.iconPath.split('/').pop();
  return fileName ? ICON_BASE + fileName : '';
}

/**
 * Resolve an accessible URL for a folder icon; specific names (e.g. src) use a dedicated icon, otherwise the default folder icon.
 * @param name folder name
 */
export function materialFolderUrl(name: string): string {
  const byName = manifest.folderNames[name.toLowerCase()];
  return urlForIconName(byName ?? manifest.folder);
}
