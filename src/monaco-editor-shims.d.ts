/**
 * monaco-editor's deep ESM entry points ship no corresponding type declaration exports
 * (bundler module resolution can't find the deep .d.ts), yet they resolve fine at runtime
 * (Vite). Here we declare these deep modules' types as equivalent to the full namespace of
 * the 'monaco-editor' package root, so TS can provide types like monaco.editor.*.
 *
 * Type-level only: produces no runtime code. Which entry point is actually loaded at runtime
 * is decided by the real import statements (see monaco-core.ts -- uses editor.api, without the language service).
 */
declare module 'monaco-editor/editor/editor.api' {
  export * from 'monaco-editor';
}

declare module 'monaco-editor/basic-languages/monaco.contribution' {
  const contribution: unknown;
  export default contribution;
}
