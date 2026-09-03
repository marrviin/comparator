/**
 * Warm up Monaco's diff Web Worker at app startup — and keep it alive.
 *
 * Monaco offloads diff computation to an editor Web Worker that is created
 * *lazily* on the first `computeDiff` request. Before the worker can answer, it
 * must load its (large) worker module graph. In a Vite dev build that graph is
 * unbundled, so the worker pulls hundreds of ES modules over HTTP one-by-one —
 * taking several seconds. That load, NOT the diff algorithm (which runs in
 * ~20ms for a 400-line file, measured), is why the colored diff appears many
 * seconds after the file text.
 *
 * Crucially, the editor worker is a *shared singleton* owned by the global
 * EditorWorkerService, but it is torn down when it has no live diff editor
 * clients. An earlier version of this prewarm disposed its off-screen editor as
 * soon as the first diff completed — which dropped the client count to zero and
 * let the freshly-warmed worker be disposed, so the first *real* comparison had
 * to cold-load the worker all over again (observed: a second `getWorker` call
 * and a ~5s stall).
 *
 * Fix: keep a single tiny off-screen diff editor alive for the whole app
 * lifetime. It costs almost nothing (one hidden 1-line diff editor, no minimap /
 * ruler / auto-layout) but guarantees the shared worker stays loaded, so every
 * real comparison reuses the already-warm worker and its `onDidUpdateDiff` fires
 * immediately.
 */
import * as monaco from './monaco-core';
import './monaco-env';

let started = false;
// Retained so the hidden editor/models are never garbage-collected or disposed
// (which would let the shared worker be torn down). Intentionally kept alive.
let keepAlive: {
  editor: monaco.editor.IStandaloneDiffEditor;
  original: monaco.editor.ITextModel;
  modified: monaco.editor.ITextModel;
  host: HTMLDivElement;
} | null = null;

/** Idempotent: only the first call warms the worker; later calls are no-ops. */
export function prewarmDiffWorker(): void {
  if (started) return;
  started = true;

  const host = document.createElement('div');
  host.style.cssText =
    'position:absolute;left:-99999px;top:-99999px;width:400px;height:200px;visibility:hidden;pointer-events:none';
  document.body.appendChild(host);

  const original = monaco.editor.createModel('warm up\n', 'plaintext');
  const modified = monaco.editor.createModel('warm up!\n', 'plaintext');

  try {
    const editor = monaco.editor.createDiffEditor(host, {
      automaticLayout: false,
      minimap: { enabled: false },
      renderOverviewRuler: false,
    });
    editor.setModel({ original, modified });

    // Keep the editor + models alive for the app's lifetime so the shared worker
    // stays loaded (it is torn down when no diff editor client references it).
    keepAlive = { editor, original, modified, host };
  } catch {
    // Prewarm must never surface an error into the app; on failure just drop the
    // scratch resources.
    try {
      original.dispose();
      modified.dispose();
      host.remove();
    } catch {
      /* ignore */
    }
  }
}

/** Escape hatch (e.g. for tests/hot-reload): dispose the retained warm editor. */
export function disposePrewarm(): void {
  if (!keepAlive) return;
  try {
    keepAlive.editor.dispose();
    keepAlive.original.dispose();
    keepAlive.modified.dispose();
    keepAlive.host.remove();
  } catch {
    /* ignore */
  }
  keepAlive = null;
}
