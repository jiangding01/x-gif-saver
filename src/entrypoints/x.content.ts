// x.com 内容脚本：找出带 GIF 的推文，在其底部操作栏注入「存 GIF」按钮。
// 只在推文自己带 GIF 时注入；引用推文里的 GIF 不算（见 adapters/x.ts）。
// 覆盖时间线、详情页和大图浏览弹窗；私信（XChat）没有推文操作栏，不注入。
//
// 去重：每个容器（article 或弹窗）记一条 { key, ui }。key = 推文 ID + 媒体 ID 列表；
// key 变了（X 复用节点）或宿主被 X 重渲染摘掉了，就移除重挂。
// createShadowRootUi 是异步的，挂载前先同步占位，避免 await 期间下一轮扫描重复挂载。

import { browser, type ContentScriptContext, defineContentScript } from '#imports';
import { type GifTarget, modalTarget, TWEET_SELECTOR, tweetTarget } from '../adapters/x';
import type { ToBackground, ToContent } from '../core/messages';
import { mountSaveButton, type SaveButton } from '../ui/button';

type Mounted = { key: string; actionBar: Element; ui: Promise<SaveButton | null> };

const keyOf = (target: GifTarget): string =>
  [target.sources[0]?.tweetId, ...target.sources.map((s) => s.mediaId)].join(':');

const isAlive = (ui: SaveButton, actionBar: Element): boolean =>
  ui.shadowHost.isConnected && actionBar.contains(ui.shadowHost);

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  main(ctx: ContentScriptContext) {
    const mounted = new WeakMap<Element, Mounted>();

    const findTargets = (): GifTarget[] => {
      const targets: GifTarget[] = [];
      for (const article of document.querySelectorAll(TWEET_SELECTOR)) {
        const target = tweetTarget(article);
        if (target) targets.push(target);
      }
      const modal = modalTarget(document, location.pathname);
      if (modal) targets.push(modal);
      return targets;
    };

    /** 点击时重新识别一次，拿到最新的 GIF 列表（懒加载可能刚补上 src） */
    const startJob = (container: Element) => {
      const fresh = findTargets().find((t) => t.container === container);
      if (!fresh) return;
      const msg: ToBackground = { target: 'background', type: 'job:start', sources: fresh.sources };
      void browser.runtime.sendMessage(msg);
    };

    const mount = (target: GifTarget) => {
      const { container, actionBar } = target;
      const ui = mountSaveButton(ctx, actionBar, () => startJob(container)).catch((err) => {
        console.warn('[x-gif-saver] 按钮挂载失败', err);
        return null;
      });
      mounted.set(container, { key: keyOf(target), actionBar, ui });
    };

    const sync = (target: GifTarget) => {
      const prev = mounted.get(target.container);
      if (!prev) {
        mount(target);
        return;
      }
      if (prev.key === keyOf(target) && prev.actionBar === target.actionBar) {
        // 还在挂载中，或挂载成功且宿主仍在原操作栏里：保持不动
        void prev.ui.then((ui) => {
          if (mounted.get(target.container) !== prev) return;
          if (ui && isAlive(ui, target.actionBar)) return;
          mounted.delete(target.container);
          ui?.remove();
          scheduleScan();
        });
        return;
      }
      // 推文换了（节点复用）或操作栏换了：先占位新挂载，再回收旧的
      void prev.ui.then((ui) => ui?.remove());
      mount(target);
    };

    const scan = () => {
      for (const target of findTargets()) sync(target);
    };

    let scheduled = false;
    const scheduleScan = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scan();
      });
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'poster'],
    });
    scan();

    // background 回传的任务进度/结果。M1-5 改为驱动按钮状态，目前只打调试日志
    const onJobMessage = (msg: ToContent) => console.debug(`[x-gif-saver] ${JSON.stringify(msg)}`);
    browser.runtime.onMessage.addListener(onJobMessage);

    // 按钮 UI 随 ctx 失效由 WXT 自动移除；这里只需停掉观察和监听
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.runtime.onMessage.removeListener(onJobMessage);
    });
  },
});
