/**
 * App entry: theme/providers shell + router configuration. The persistent shell
 * (recent sider + content card) lives in AppLayout; each comparison mode is its
 * own route so the views can be maintained independently.
 */
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import type { Locale } from 'antd/es/locale';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { StyleProvider } from '@ant-design/cssinjs';
import { XProvider } from '@ant-design/x';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from './layout';
import { SettingsProvider, useSettings } from './settings';
import type { Lang } from './i18n';
import { HomePage } from './pages/home';
import { TextComparePage } from './pages/text-compare';
import { FolderCompareLayout } from './pages/folder-compare';
import { FolderIndexPage } from './pages/folder-index';
import { FolderFilePage } from './pages/folder-file';
import { GitCompareLayout } from './pages/git-compare';
import { GitIndexPage } from './pages/git-index';
import { GitFilePage } from './pages/git-file';

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
      {
        path: 'folder-compare',
        element: <FolderCompareLayout />,
        children: [
          { index: true, element: <FolderIndexPage /> },
          { path: 'file', element: <FolderFilePage /> },
        ],
      },
      {
        path: 'git-compare',
        element: <GitCompareLayout />,
        children: [
          { index: true, element: <GitIndexPage /> },
          { path: 'file', element: <GitFilePage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const ANTD_LOCALES: Record<Lang, Locale> = {
  'zh-CN': zhCN,
  en: enUS,
};

/**
 * antd theme + locale shell. Must live inside SettingsProvider so the locale can be derived from the current language;
 * theme tokens are language-independent, but kept here too to save one extra layer of ConfigProvider nesting.
 */
function ThemedShell() {
  const { lang } = useSettings();
  return (
    <ConfigProvider
      locale={ANTD_LOCALES[lang]}
      theme={{
        cssVar: { key: 'pc' },
        algorithm: theme.defaultAlgorithm,
        token: {
          // Two seed colors aligned with joybuddy: accent blue + brand functional colors.
          colorPrimary: '#3768fa',
          colorInfo: '#3768fa',
          colorSuccess: '#00b26f',
          colorWarning: '#f08433',
          colorError: '#f33b50',
          // Softer strokes, rounder surfaces, light desktop background / container background.
          colorBorder: '#e8e8ea',
          borderRadius: 8,
          colorBgLayout: '#f2f2f2',
          colorBgContainer: '#fafafa',
          controlItemBgActive: 'rgba(0,0,0,0.06)',
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
