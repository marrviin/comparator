/**
 * Monaco worker bootstrap for the Vite + Tauri bundle. Monaco offloads its diff
 * computation (and basic editing helpers) to a Web Worker. In a Tauri build the
 * app is served from a custom protocol, so we bundle the worker locally via
 * Vite's `?worker` import rather than loading it from a CDN — CDN loading would
 * break offline and under CSP.
 *
 * We only wire the generic editorWorker here — it powers the diff algorithm and
 * basic editing. We deliberately do NOT register the language service workers
 * (json/css/html/ts): this app is a diff tool, so it only needs syntax
 * highlighting (Monarch, main-thread, no worker; see monaco-core.ts) plus diff.
 * Registering the language workers would spin up a per-language worker and run a
 * full-document language analysis when a code file opens — a visible startup
 * delay before the diff shows, for features (completion/diagnostics/formatting)
 * this tool never uses. Every `label` therefore falls back to editorWorker.
 */
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
// Trigger 'monaco-editor's global type declaration (it does
// `declare global { var MonacoEnvironment }`); type-only reference, erased at compile time.
import type {} from 'monaco-editor';

// Monaco reads this global to spawn workers. Returning a fresh worker instance
// per request is what the loader expects. We route every label to the generic
// editorWorker since no language service workers are registered.
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};
