import { defineConfig } from 'wxt';

// 详见 docs/TECH-DESIGN.md「权限」一节：只申请用得到的权限
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // 发布包名：插件名 + v版本号，与 Git 标签写法一致，如 x-gif-saver-v0.1.0.zip
  zip: { artifactTemplate: '{{name}}-v{{version}}.zip' },
  manifest: {
    name: 'X GIF Saver',
    description: '一键把 X 上的 GIF 保存为 .gif 文件，可作为表情包使用',
    // contextMenus 在 M2-5（右键菜单兜底）时再加
    permissions: ['downloads', 'offscreen', 'storage'],
    host_permissions: ['https://x.com/*', 'https://twitter.com/*', 'https://video.twimg.com/*'],
  },
});
