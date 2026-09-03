/**
 * Sync icon assets from the npm package `material-icon-theme` into the project
 * (the officially recommended way to consume it on the web).
 *
 * The package is essentially a VSCode extension; its README explains that the svgs
 * live in node_modules/material-icon-theme/icons, and generateManifest() yields the
 * "file name / folder name -> icon" mapping needed to render icons in a web project.
 *
 * This script produces two build-time assets (neither is committed to git, see .gitignore):
 *   1. public/material-icon-theme/icons/*.svg -- all colored icons, copied as-is by Vite as static assets.
 *   2. src/assets/material-icon-theme/material-icons.json -- a slimmed-down copy of the official mapping,
 *      keeping only the fields used at runtime (src/material-icons.ts) to avoid bloat / slowing typecheck.
 *
 * Run automatically by predev / prebuild; also triggered via postinstall on the first pnpm install after cloning.
 */
import { generateManifest } from 'material-icon-theme';
import { createRequire } from 'node:module';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Locate the icons directory inside the npm package (follow package resolution, don't hardcode the node_modules path).
const pkgEntry = require.resolve('material-icon-theme');
// pkgEntry looks like .../material-icon-theme/dist/module/index.cjs; walk back up to the package root.
const pkgRoot = join(dirname(pkgEntry), '..', '..');
const iconsSrc = join(pkgRoot, 'icons');

const publicIcons = join(projectRoot, 'public', 'material-icon-theme', 'icons');
const manifestOut = join(
  projectRoot,
  'src',
  'assets',
  'material-icon-theme',
  'material-icons.json',
);

// 1) Generate the official manifest and slim it down to the fields needed at runtime.
const full = generateManifest();
const slim = {
  file: full.file,
  folder: full.folder,
  fileExtensions: full.fileExtensions ?? {},
  fileNames: full.fileNames ?? {},
  folderNames: full.folderNames ?? {},
  iconDefinitions: Object.fromEntries(
    Object.entries(full.iconDefinitions ?? {}).map(([name, def]) => [
      name,
      { iconPath: def.iconPath },
    ]),
  ),
};

// 2) Copy all svgs to public (clear it first to avoid leftover stale icons).
await rm(publicIcons, { recursive: true, force: true });
await mkdir(publicIcons, { recursive: true });
await cp(iconsSrc, publicIcons, { recursive: true });

// 3) Write the slim manifest.
await mkdir(dirname(manifestOut), { recursive: true });
await writeFile(manifestOut, JSON.stringify(slim), 'utf8');

const iconCount = Object.keys(slim.iconDefinitions).length;
console.log(`[sync-material-icons] copied svg icons + wrote slim manifest (${iconCount} icons)`);
