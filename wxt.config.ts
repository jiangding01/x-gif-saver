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
  modules: ['@wxt-dev/module-react'],
  // 发布包名：插件名 + v版本号，与 Git 标签写法一致，如 x-gif-saver-v0.1.0.zip
  zip: { artifactTemplate: '{{name}}-v{{version}}.zip' },
  manifest: {
    name: 'X GIF Saver',
    description: '一键把 X 上的 GIF 保存为 .gif 文件，可作为表情包使用',
    // contextMenus：浏览器右键菜单「保存为 GIF」，操作栏按钮失效时兜底（M2-5）
    permissions: ['contextMenus', 'downloads', 'offscreen', 'storage'],
    host_permissions: ['https://x.com/*', 'https://twitter.com/*', 'https://video.twimg.com/*'],
    icons: ICONS,
    // 工具栏按钮：点击打开设置页（background 监听 action.onClicked），不需要额外权限
    action: {
      default_title: 'X GIF Saver 设置',
      default_icon: ICONS,
    },
  },
});
