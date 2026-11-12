// 端到端：加载构建好的扩展，在样本推文页上走完「点击 → 转换 → 下载」的完整链路
// （content script → background → offscreen → Worker → chrome.downloads）。
// 不访问真实网络：x.com 页面由 Playwright 的 route 提供，GIF 视频由本地 HTTPS 服务提供。

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type BrowserContext, chromium, expect, type Page, test } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTENSION = path.join(ROOT, '.output/chrome-mv3');
const SAMPLE_MP4 = path.join(ROOT, 'src/pipeline/__fixtures__/testsrc-480-15fps-65f.mp4');
const TWEET_ID = '1866000000000000001';
const TWEET_URL = `https://x.com/e2e_user/status/${TWEET_ID}`;

let context: BrowserContext;
let userDataDir: string;
let downloadDir: string;
let videoServer: Server;

/**
 * 本地假冒 video.twimg.com：GIF 视频由 offscreen 里的 Worker 下载，Playwright 的 route 拦不到 Worker 的请求，
 * 所以用 --host-resolver-rules 把域名解析到本机的 HTTPS 服务。证书用 openssl 临时生成，不进仓库
 */
const startVideoServer = async (dir: string): Promise<number> => {
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      key,
      '-out',
      cert,
    ].concat(['-subj', '/CN=video.twimg.com']),
    { stdio: 'ignore' },
  );
  const mp4 = await readFile(SAMPLE_MP4);
  videoServer = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    (req, res) => {
      if (!/^\/tweet_video\/[\w-]+\.mp4/.test(req.url ?? '')) {
        res.writeHead(404).end();
        return;
      }
      res
        .writeHead(200, { 'content-type': 'video/mp4', 'access-control-allow-origin': '*' })
        .end(mp4);
    },
  );
  await new Promise<void>((resolve) => videoServer.listen(0, '127.0.0.1', resolve));
  return (videoServer.address() as AddressInfo).port;
};

test.beforeAll(async () => {
  userDataDir = await mkdtemp(path.join(tmpdir(), 'xgs-e2e-'));
  const port = await startVideoServer(userDataDir);
  // 默认下载目录放进临时目录：测试里恢复 Chrome 的默认下载行为，文件名才走扩展的 onDeterminingFilename
  downloadDir = path.join(userDataDir, 'downloads');
  await mkdir(path.join(userDataDir, 'Default'), { recursive: true });
  await writeFile(
    path.join(userDataDir, 'Default/Preferences'),
    JSON.stringify({ download: { default_directory: downloadDir, prompt_for_download: false } }),
  );
  // 扩展只能在完整 Chromium 里加载（headless shell 不支持），channel: 'chromium' 用新版无头模式
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      `--host-resolver-rules=MAP video.twimg.com 127.0.0.1:${port}`,
      '--ignore-certificate-errors',
    ],
  });
  const html = await readFile(path.join(import.meta.dirname, 'fixtures/tweet.html'), 'utf8');
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'x.com') {
      // ?no-bar：去掉操作栏，模拟 X 改版导致按钮注入失效
      const body = url.searchParams.has('no-bar')
        ? html.replace(/<!-- ACTION_BAR[\s\S]*?\/ACTION_BAR -->/, '')
        : html;
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    }
    if (['chrome-extension:', 'blob:', 'data:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
});

test.afterAll(async () => {
  await context?.close();
  videoServer?.close();
  await rm(userDataDir, { recursive: true, force: true });
});

const openTweet = async (query = ''): Promise<Page> => {
  const page = await context.newPage();
  // Playwright 默认接管下载并改成随机文件名，会绕过扩展的文件名认领；恢复 Chrome 的默认行为
  const cdp = await context.newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
  await page.goto(`${TWEET_URL}${query}`);
  return page;
};

/** 扩展的 service worker；刚启动时可能还没注册，等它出现（CI 机器较慢时会遇到） */
const extensionWorker = async () =>
  context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

/** 最近一次完成的下载：路径（相对下载目录）、尺寸与文件头 */
const latestDownload = async () => {
  const [item] = await (await extensionWorker()).evaluate(() =>
    chrome.downloads.search({ state: 'complete', orderBy: ['-startTime'], limit: 1 }),
  );
  if (!item) throw new Error('没有完成的下载');
  const bytes = await readFile(item.filename);
  return {
    relative: path.relative(downloadDir, item.filename),
    size: bytes.length,
    header: bytes.subarray(0, 6).toString('latin1'),
    // GIF 逻辑屏幕宽高：第 6–9 字节，小端
    width: bytes.readUInt16LE(6),
    height: bytes.readUInt16LE(8),
  };
};

test('左键点按钮：用默认预设转换，按模板命名下载', async () => {
  const page = await openTweet();
  const button = page.locator('xgs-save-button button.save');
  await expect(button).toHaveAttribute('aria-label', '保存为 GIF，右键可选预设');
  await button.click();

  await expect(button).toHaveAttribute('data-kind', 'done', { timeout: 45_000 });
  await expect(button).toHaveAttribute('title', /^已保存 .+ · 480×480 · 15fps$/);
  const file = await latestDownload();
  expect(file.relative).toMatch(new RegExp(`^X-GIF/${TWEET_ID}_e2e_user( \\(\\d+\\))?\\.gif$`));
  expect(file).toMatchObject({ header: 'GIF89a', width: 480, height: 480 });
  await page.close();
});

test('右键按钮选「表情包」：只这一次用该预设，体积在 1MB 以内', async () => {
  const page = await openTweet();
  const button = page.locator('xgs-save-button button.save');
  await button.click({ button: 'right' });
  const sticker = page.locator('xgs-save-button [role="menuitem"]', { hasText: '表情包' });
  await expect(sticker).toBeVisible();
  await sticker.click();

  await expect(button).toHaveAttribute('data-kind', 'done', { timeout: 45_000 });
  await expect(button).toHaveAttribute('title', /^已保存（表情包）.+ · 320×320 · /);
  const file = await latestDownload();
  expect(file).toMatchObject({ header: 'GIF89a', width: 320, height: 320 });
  expect(file.size).toBeLessThanOrEqual(1024 * 1024);
  await page.close();
});

test('按钮注入失效时：在 GIF 上右键后点「保存为 GIF」仍能保存，并显示提示条', async () => {
  const page = await openTweet('?no-bar');
  await expect(page.locator('xgs-save-button')).toHaveCount(0);
  // 浏览器原生菜单无法自动化点击：先真实右键 GIF 记下位置，再由扩展发出菜单项被点击时的同一条消息
  await page.locator('[data-testid="videoComponent"]').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await (await extensionWorker()).evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://x.com/*', active: true });
    if (tab?.id === undefined) throw new Error('找不到样本页标签');
    await chrome.tabs.sendMessage(tab.id, { target: 'content', type: 'context:save' });
  });

  const toast = page.locator('xgs-toast .toast');
  await expect(toast).toHaveText(/^已保存 .+ · 480×480 · 15fps$/, { timeout: 45_000 });
  const file = await latestDownload();
  expect(file.relative).toMatch(new RegExp(`^X-GIF/${TWEET_ID}_e2e_user( \\(\\d+\\))?\\.gif$`));
  expect(file.header).toBe('GIF89a');
  await page.close();
});
