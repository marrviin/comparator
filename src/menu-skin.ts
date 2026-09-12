/**
 * Shared antd Menu skin, applied by the sidebar (nav + recent lists) and the
 * settings modal's left nav — see the .pc-menu-skin rules in styles/antd.css.
 * It replicates the row look that originally came from @ant-design/x
 * Conversations: 32px rows, 8px inline padding, the theme-tinted hover/selected
 * wash (controlItemBgActive — never the primary color), and neutral text.
 * Values reference the global antd CSS vars (cssVar mode), so dark mode follows
 * automatically. Wrap the Menu in <ConfigProvider theme={menuSkinTheme}> and add
 * the `pc-menu-skin` class to it.
 */
import type { ThemeConfig } from 'antd';

export const menuSkinTheme: ThemeConfig = {
  components: {
    Menu: {
      itemBg: 'transparent',
      itemHeight: 32,
      itemMarginBlock: 0,
      itemMarginInline: 0,
      itemPaddingInline: 8,
      itemHoverBg: 'var(--ant-control-item-bg-active, rgba(0,0,0,0.06))',
      itemSelectedBg: 'var(--ant-control-item-bg-active, rgba(0,0,0,0.06))',
      // The old Conversations never tinted text with the primary color; keep text neutral.
      itemSelectedColor: 'var(--ant-color-text)',
      iconMarginInlineEnd: 8,
      activeBarBorderWidth: 0,
    },
  },
};
