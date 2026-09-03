import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import { prewarmDiffWorker } from './monaco-prewarm';
import './i18n';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Spin up Monaco's diff Web Worker ahead of time (during idle, after first paint)
// so the first real comparison doesn't pay the worker cold-start — the gap that
// makes the colored diff appear well after the file text. See monaco-prewarm.ts.
const warm = () => prewarmDiffWorker();
if ('requestIdleCallback' in window) {
  requestIdleCallback(warm, { timeout: 2000 });
} else {
  setTimeout(warm, 500);
}
