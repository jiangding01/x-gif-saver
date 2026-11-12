import { defineConfig } from '@playwright/test';

// 端到端测试：加载 pnpm build 产出的扩展（.output/chrome-mv3），把 x.com 页面与 GIF 视频换成本地样本，
// 覆盖 content script → background → offscreen → Worker → 下载的完整链路。见 e2e/README.md
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
});
