import { defineConfig } from 'wxt';

// 插件与工具栏图标，文件在 public/icons（原稿 icon.svg 供设置页标题使用）
const ICONS = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png',
};

// 详见 docs/TECH-DESIGN.md「权限」一节：只申请用得到的权限
export default defineConfig({
  srcDir: 'src',
  // i18n：文案在 src/locales/{en,zh_CN}.json，界面语言跟随浏览器，非中文一律英文（default_locale）
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  // 发布包名：插件名 + v版本号，与 Git 标签写法一致，如 x-gif-saver-v0.1.0.zip
  zip: { artifactTemplate: '{{name}}-v{{version}}.zip' },
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // contextMenus：浏览器右键菜单「保存为 GIF」，操作栏按钮失效时兜底（M2-5）
    permissions: ['contextMenus', 'downloads', 'offscreen', 'storage'],
    host_permissions: ['https://x.com/*', 'https://twitter.com/*', 'https://video.twimg.com/*'],
    icons: ICONS,
    // 工具栏按钮：点击打开设置页（background 监听 action.onClicked），不需要额外权限
    action: {
      default_title: '__MSG_actionTitle__',
      default_icon: ICONS,
    },
  },
});
