// 导出 Chrome 应用商店素材（PNG，不带透明通道）：
//   - 小宣传图 440×280：docs/store/promo/small-tile.html → small-tile-{en,zh}.png
//   - 截图 1280×800：docs/store/screenshots/screenshot.html + src/<图名>-<lang>.jpg → <序号>-<图名>-<lang>.png
//     只导出 src/ 里已有界面截图的组合
// 用法：node scripts/render-promo.mjs（首次先 pnpm exec playwright install chromium）
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const LANGS = ['en', 'zh'];
// 顺序即商店里的展示顺序
const SHOTS = ['save', 'menu', 'presets', 'custom'];

const store = fileURLToPath(new URL('../docs/store/', import.meta.url));

const render = async (browser, { html, width, height, jobs }) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  for (const { query, out } of jobs) {
    await page.goto(`${pathToFileURL(html).href}?${query}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
    });
    await page.screenshot({ path: out });
    console.log(out);
  }
  await page.close();
};

const browser = await chromium.launch();
await render(browser, {
  html: `${store}promo/small-tile.html`,
  width: 440,
  height: 280,
  jobs: LANGS.map((lang) => ({
    query: `lang=${lang}`,
    out: `${store}promo/small-tile-${lang}.png`,
  })),
});
await render(browser, {
  html: `${store}screenshots/screenshot.html`,
  width: 1280,
  height: 800,
  jobs: LANGS.flatMap((lang) =>
    SHOTS.flatMap((shot, i) =>
      existsSync(`${store}screenshots/src/${shot}-${lang}.jpg`)
        ? [
            {
              query: `shot=${shot}&lang=${lang}`,
              out: `${store}screenshots/${i + 1}-${shot}-${lang}.png`,
            },
          ]
        : [],
    ),
  ),
});
await browser.close();
