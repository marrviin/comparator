import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The codicon .ttf lives at a deep path inside monaco-editor, but monaco's package.json `exports`
// only maps subpaths via "./*" -> "./esm/vs/*.js" (a forced .js suffix), so neither a plain import
// nor a `?url` import of the .ttf can be resolved through the package name. We alias a virtual
// specifier straight to the real file so Vite bundles it. See src/monaco-core.ts for why we need
// the font (diff gutter +/- marks are codicon glyphs and show as tofu boxes without the @font-face).
const codiconTtf = fileURLToPath(
  new URL(
    './node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.ttf',
    import.meta.url,
  ),
);

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      'monaco-codicon-font.ttf': codiconTtf,
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
