/**
 * Application preferences: ignored directories, diff options (ignore whitespace/case),
 * unsaved-changes guard, file watching.
 * Persisted via the Tauri Store plugin (JSON on disk, settings.json) rather than localStorage,
 * so preferences can be shared across windows and migrate with the app data directory.
 *
 * Exports:
 *   - SettingsProvider: mounted at the app root; asynchronously loads the store on the first frame, then injects context;
 *   - useSettings(): reads the current settings + `update(patch)` for incremental write-back;
 *   - DEFAULT_SETTINGS / Settings type.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { applyLang, FALLBACK_LANG, resolveLang, type Lang, type LangSetting } from './i18n';

export interface Settings {
  /** UI language: 'system' to follow the OS, or an explicit 'zh-CN' / 'en'. */
  language: LangSetting;
  /** Ignore directories by name during folder comparison (exact match at any depth). */
  ignoreDirs: string[];
  /** Ignore whitespace differences (leading/trailing whitespace + collapse consecutive whitespace). */
  ignoreWhitespace: boolean;
  /** Ignore case differences. */
  ignoreCase: boolean;
  /** When there are unsaved changes, show a confirmation prompt before leaving/switching. */
  confirmOnUnsaved: boolean;
  /** Watch open files for external changes and prompt to reload. */
  watchFiles: boolean;
}

/** Built-in default ignored directories (matching the old backend's hardcoded list); treated as "built-in" and not removable. */
export const BUILTIN_IGNORE_DIRS = ['.git', 'node_modules', 'target', 'dist', '.DS_Store'];

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  ignoreDirs: [...BUILTIN_IGNORE_DIRS],
  ignoreWhitespace: false,
  ignoreCase: false,
  confirmOnUnsaved: true,
  watchFiles: true,
};

const STORE_FILE = 'settings.json';
const STORE_KEY = 'preferences';

/** Lazily-loaded store: the disk file is only opened on first read/write. */
const store = new LazyStore(STORE_FILE);

/** Read persisted settings, filling missing fields with defaults; falls back to all defaults on failure. */
async function loadSettings(): Promise<Settings> {
  try {
    const saved = await store.get<Partial<Settings>>(STORE_KEY);
    return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Write back the whole settings object (best-effort, fails silently -- settings shouldn't block the main flow). */
async function saveSettings(next: Settings): Promise<void> {
  try {
    await store.set(STORE_KEY, next);
    await store.save();
  } catch {
    // ignore: if persistence fails the in-memory state still applies; on next launch it falls back to defaults.
  }
}

interface SettingsContextValue {
  settings: Settings;
  /** Incremental update: only pass the fields you want to change. */
  update: (patch: Partial<Settings>) => void;
  /** Whether the store has finished its first load (renders with defaults until then). */
  loaded: boolean;
  /** The currently effective UI language (with 'system' already resolved to a concrete language), used to derive the antd locale. */
  lang: Lang;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  // The currently effective language: the result of resolving 'system', or the user's explicit choice.
  const [lang, setLang] = useState<Lang>(FALLBACK_LANG);
  // Avoid the first-frame load (writing store values back into memory) triggering one redundant saveSettings.
  const hydrating = useRef(true);

  useEffect(() => {
    let alive = true;
    void loadSettings().then((s) => {
      if (!alive) return;
      setSettings(s);
      setLoaded(true);
      hydrating.current = false;
    });
    return () => {
      alive = false;
    };
  }, []);

  // On language change (including once the first-frame load completes) -> resolve the actual language and sync it to i18next + local lang.
  useEffect(() => {
    let alive = true;
    void resolveLang(settings.language).then((resolved) => {
      if (!alive) return;
      setLang(resolved);
      void applyLang(resolved);
    });
    return () => {
      alive = false;
    };
  }, [settings.language]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (!hydrating.current) void saveSettings(next);
      return next;
    });
  }, []);

  return createElement(
    SettingsContext.Provider,
    { value: { settings, update, loaded, lang } },
    children,
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
