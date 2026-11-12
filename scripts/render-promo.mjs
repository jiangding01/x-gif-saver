// 把 docs/store/promo/small-tile.html 导出为商店小宣传图（440×280 PNG，中英各一张）
// 用法：node scripts/render-promo.mjs（首次先 pnpm exec playwright install chromium）
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const dir = fileURLToPath(new URL('../docs/store/promo/', import.meta.url));
const pageUrl = pathToFileURL(`${dir}small-tile.html`).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
for (const lang of ['en', 'zh']) {
  await page.goto(`${pageUrl}?lang=${lang}`);
  await page.evaluate(() => document.fonts.ready);
  const out = `${dir}small-tile-${lang}.png`;
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
