import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // 单测没有 chrome.i18n：#i18n 换成读 en.json 的实现（见 src/testing/i18n.ts）
    alias: { '#i18n': fileURLToPath(new URL('./src/testing/i18n.ts', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
