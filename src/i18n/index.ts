/**
 * i18next instance: Chinese/English bilingual, zh-CN is the fallback (source) language.
 *
 * Language is driven by settings (settings.language: 'system' | 'zh-CN' | 'en'):
 *   - a concrete language: switch to it directly;
 *   - 'system': read the system locale via the Tauri os plugin, mapped to zh-CN / en.
 * On language change, SettingsProvider calls applyLanguage() to sync the result to
 * i18next (this module), antd (ConfigProvider, see app.tsx), and Monaco.
 *
 * In components use useTranslation() / t('ns:key'); namespaces live in locales/*.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { locale as osLocale } from '@tauri-apps/plugin-os';
import zhCN from './locales/zh-CN';
import en from './locales/en';

export type Lang = 'zh-CN' | 'en';
/** Languages selectable in settings (including "follow system"). */
export type LangSetting = 'system' | Lang;

export const SUPPORTED_LANGS: Lang[] = ['zh-CN', 'en'];
export const FALLBACK_LANG: Lang = 'zh-CN';

/** i18next namespaces (mirror the locales structure). */
const NS = ['common', 'layout', 'home', 'folder', 'git', 'diff', 'settings'] as const;

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': zhCN,
    en,
  },
  lng: FALLBACK_LANG,
  fallbackLng: FALLBACK_LANG,
  ns: NS as unknown as string[],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Normalize any locale string (e.g. en-US / zh-Hans-CN) to a supported language. */
function normalize(tag: string | null | undefined): Lang {
  if (!tag) return FALLBACK_LANG;
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en';
  return FALLBACK_LANG;
}

/** Resolve the system language; fall back to the fallback language when the os plugin is unavailable (e.g. outside Tauri). */
async function resolveSystemLang(): Promise<Lang> {
  try {
    return normalize(await osLocale());
  } catch {
    return FALLBACK_LANG;
  }
}

/** Resolve a setting into an actual language (handling 'system'). */
export async function resolveLang(setting: LangSetting): Promise<Lang> {
  return setting === 'system' ? resolveSystemLang() : setting;
}

/** Apply a resolved language to i18next (antd/Monaco syncing is handled by the caller). */
export async function applyLang(lang: Lang): Promise<void> {
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

export default i18n;
