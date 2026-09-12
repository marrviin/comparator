/**
 * App entry: theme/providers shell + router configuration. The persistent shell
 * (recent sider + content card) lives in AppLayout; each comparison mode is its
 * own route so the views can be maintained independently.
 */
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import { useEffect } from 'react';
import type { Locale } from 'antd/es/locale';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { StyleProvider } from '@ant-design/cssinjs';
import { XProvider } from '@ant-design/x';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from './layout';
import { isMac } from './platform';
import { SettingsProvider, useSettings } from './settings';
import type { Lang } from './i18n';
import { HomePage } from './pages/home';
import { TextComparePage } from './pages/text-compare';
import { FolderComparePage } from './pages/folder-compare';
import { GitComparePage } from './pages/git-compare';

// History (Browser) router: Tauri serves the app from a single-origin custom
// protocol (tauri://localhost) whose root is "/", so history routing works
// without server rewrites. Deep links start from "/" and navigate in-app.
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'text-compare', element: <TextComparePage /> },
      // Folder/git compare are single routes with internal tabs: the active tab
      // is mirrored as the `?file=` search param; the former `file` child
      // routes became always-mounted panes inside the pages.
      { path: 'folder-compare', element: <FolderComparePage /> },
      { path: 'git-compare', element: <GitComparePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const ANTD_LOCALES: Record<Lang, Locale> = {
  'zh-CN': zhCN,
  en: enUS,
};

const themeDarkAlgorithm = theme.darkAlgorithm;

/**
 * antd theme + locale shell. Must live inside SettingsProvider so the locale can be derived from the current language;
 * theme tokens are language-independent, but kept here too to save one extra layer of ConfigProvider nesting.
 */
function ThemedShell() {
  const { lang, theme: appTheme } = useSettings();
  const isDark = appTheme === 'dark';

  // Toggle the root theme class: styles.css hangs the fixed-color dark overrides (diff palette,
  // hatch, color-scheme) on it, and index.html pre-paints it before React mounts.
  useEffect(() => {
    document.documentElement.classList.toggle('pc-dark', isDark);
  }, [isDark]);

  // macOS vibrancy gate (never toggles): styles.css keys the transparent root +
  // theme-tinted wash off html.pc-vibrancy; other platforms stay opaque.
  useEffect(() => {
    document.documentElement.classList.toggle('pc-vibrancy', isMac);
  }, []);

  return (
    <ConfigProvider
      locale={ANTD_LOCALES[lang]}
      theme={{
        cssVar: { key: 'pc' },
        algorithm: isDark ? themeDarkAlgorithm : theme.defaultAlgorithm,
        token: {
          // Two seed colors aligned with joybuddy: accent blue + brand functional colors.
          colorPrimary: '#3768fa',
          colorInfo: '#3768fa',
          colorSuccess: '#00b26f',
          colorWarning: '#f08433',
          colorError: '#f33b50',
          // Softer strokes, rounder surfaces, light desktop background / container background
          // (dark equivalents follow the same softer-than-default relationship).
          colorBorder: isDark ? '#3a3a3c' : '#e8e8ea',
          borderRadius: 12,
          borderRadiusSM: 8,
          borderRadiusXS: 6,
          colorBgLayout: isDark ? '#161617' : '#f2f2f2',
          colorBgContainer: isDark ? '#1d1d1f' : '#fafafa',
          controlItemBgActive: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
        components: {
          // Flat buttons — remove antd's default primary/default/danger button shadows.
          Button: {
            primaryShadow: 'none',
            defaultShadow: 'none',
            dangerShadow: 'none',
          },
        },
      }}
    >
      <XProvider>
        <AntdApp>
          <RouterProvider router={router} />
        </AntdApp>
      </XProvider>
    </ConfigProvider>
  );
}

function App() {
  return (
    <StyleProvider layer>
      <SettingsProvider>
        <ThemedShell />
      </SettingsProvider>
    </StyleProvider>
  );
}

export default App;
