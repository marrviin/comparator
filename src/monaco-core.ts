/**
 * Slimmed-down Monaco entry: imports only "editor core + Monarch syntax highlighting", with no
 * language service.
 *
 * Background: the default `import * as monaco from 'monaco-editor'` is the full entry, which
 * automatically registers the HTML/CSS/TS/JSON language services -- completion, hover, diagnostics,
 * formatting, folding, symbols, etc. These capabilities are implemented by their respective language
 * workers: when opening a .html/.css/.ts file, Monaco cold-starts the corresponding worker and runs a
 * language analysis over the "whole document"; this startup + analysis is exactly the culprit behind
 * "having to wait a while before the diff shows up after entering" (plain text files use the lightweight
 * default worker, so they don't stall).
 *
 * For a "comparison tool", completion/diagnostics/formatting are all unused -- we only need:
 *   1. Syntax highlighting (tokenization): done by main-thread Monarch grammars, **not relying on any
 *      worker**, from `basic-languages`;
 *   2. diff computation: via the generic editorWorker (see monaco-env.ts), language-agnostic.
 *
 * Implementation: runtime values are imported from `editor.api` (editor core) -- it contains no
 * language service, so its workers aren't bundled/started; then import the `basic-languages` Monarch
 * highlighting definitions (covering all built-in languages). The deep path isn't exported with types
 * by monaco, so its types are declared in the same directory's monaco-core.d.ts as equivalent to the
 * 'monaco-editor' namespace (type-only, erased at compile time, no runtime impact).
 *
 * Usage: `import * as monaco from './monaco-core'`, exactly the same as the old full 'monaco-editor'
 * entry usage (monaco.editor.createModel as a value, monaco.editor.ITextModel as a type both work).
 * Don't import from 'monaco-editor' anymore, or it will pull the language service back in.
 */
// Register only Monarch highlighting (pure main thread, no worker), covering all built-in languages.
// Note: the import path is mapped via monaco-editor's package.json exports ("./*" → "./esm/vs/*.js"),
// so use monaco-editor/basic-languages/... rather than monaco-editor/esm/vs/basic-languages/....
import 'monaco-editor/basic-languages/monaco.contribution';

// Codicon font + base class. The slim `editor.api` entry does NOT bundle codicon.css (the full
// `monaco-editor` entry would). Two things live in that CSS and are BOTH missing here:
//   1. the @font-face that loads codicon.ttf;
//   2. the `.codicon` base rule that actually sets `font-family: codicon` on icon elements.
// Monaco's runtime iconsStyleSheet only emits per-icon `content` (e.g. .codicon-diff-insert:before)
// WITHOUT a font-family in the default (unthemed) product-icon theme -- it relies on the base
// `.codicon` rule for the font-family. So injecting @font-face alone is not enough: without the base
// rule the diff-gutter +/- glyphs render as tofu boxes. We recreate both here.
//
// We can't `import '.../codicon.css'`: monaco's package exports map every subpath via
// "./*" -> "./esm/vs/*.js", forcing a .js suffix that can never resolve a .css/.ttf file. A Vite
// alias ('monaco-codicon-font.ttf', see vite.config.ts) points straight at the real .ttf, bypassing
// the exports map; the import yields its bundled URL, which we drop into the @font-face below.
import codiconTtfUrl from 'monaco-codicon-font.ttf';

if (typeof document !== 'undefined' && !document.getElementById('monaco-codicon-font')) {
  const style = document.createElement('style');
  style.id = 'monaco-codicon-font';
  style.textContent = `
@font-face {
  font-family: "codicon";
  font-display: block;
  src: url(${codiconTtfUrl}) format("truetype");
}
.codicon[class*='codicon-'] {
  font: normal normal normal 16px/1 codicon;
  display: inline-block;
  text-decoration: none;
  text-rendering: auto;
  text-align: center;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  user-select: none;
  -webkit-user-select: none;
}`;
  document.head.appendChild(style);
}

export * from 'monaco-editor/editor/editor.api';
