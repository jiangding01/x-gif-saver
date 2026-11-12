// x.com 内容脚本：找出带 GIF 的推文，在其底部操作栏注入「存 GIF」按钮，并驱动按钮状态。
// 只在推文自己带 GIF 时注入；引用推文里的 GIF 不算（见 adapters/x.ts）。
// 覆盖时间线、详情页和大图浏览弹窗；私信（XChat）没有推文操作栏，不注入。
//
// 挂载去重：每个容器（article 或弹窗）记一条 { key, ui }。key = 推文 ID + 媒体 ID 列表；
// key 变了（X 复用节点）或宿主被 X 重渲染摘掉了，就移除重挂。
// createShadowRootUi 是异步的，挂载前先同步占位，避免 await 期间下一轮扫描重复挂载。
//
// 状态（ROADMAP M1-5）：任务按推文 ID 存，同一推文在时间线和弹窗里的两个按钮显示同一状态，
// 按钮被 X 重挂后也能恢复。一次点击 = 一个请求（requestId），background 回传的消息按 requestId 路由。

import { browser, type ContentScriptContext, defineContentScript } from '#imports';
import { type GifTarget, modalTarget, TWEET_SELECTOR, tweetTarget } from '../adapters/x';
import { isToContent, type ToBackground, type ToContent } from '../core/messages';
import type { GifSource } from '../core/types';
import { mountSaveButton, renderButton, type SaveButton } from '../ui/button';
import {
  applyMessage,
  createTask,
  failedSources,
  isRunning,
  isSettled,
  type Task,
  viewOf,
} from '../ui/state';

type Mounted = { key: string; actionBar: Element; ui: Promise<SaveButton | null> };
type TaskEntry = { task: Task; lastEventAt: number; doneTimer?: number };

/** 距上次点击不足这么久的点击一律忽略：防双击变成「开始又取消」 */
const CLICK_DEBOUNCE_MS = 500;
/** 完成后显示 ✓ 的时长 */
const DONE_DISPLAY_MS = 3000;
/** 转换中超过这么久收不到任何消息，判超时（SW 被回收等情况的兜底）；排队中的任务不计时 */
const STALL_TIMEOUT_MS = 120_000;
const WATCHDOG_INTERVAL_MS = 5000;

const keyOf = (target: GifTarget): string =>
  [target.sources[0]?.tweetId, ...target.sources.map((s) => s.mediaId)].join(':');

const isAlive = (ui: SaveButton, actionBar: Element): boolean =>
  ui.shadowHost.isConnected && actionBar.contains(ui.shadowHost);

const tweetIdOf = (target: GifTarget): string => target.sources[0]?.tweetId ?? '';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  main(ctx: ContentScriptContext) {
    const mounted = new WeakMap<Element, Mounted>();
    const buttonsByTweet = new Map<string, Set<SaveButton>>();
    const tasks = new Map<string, TaskEntry>();
    const tweetByRequest = new Map<string, string>();
    const lastClickAt = new Map<string, number>();

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

    // ---------- 状态 ----------

    const currentView = (tweetId: string) => viewOf(tasks.get(tweetId)?.task ?? null);

    /** 刷新该推文的所有按钮（时间线、弹窗可能各有一个），顺手清掉已被 X 移除的 */
    const refresh = (tweetId: string) => {
      const buttons = buttonsByTweet.get(tweetId);
      if (!buttons) return;
      const view = currentView(tweetId);
      for (const ui of buttons) {
        if (ui.shadowHost.isConnected) renderButton(ui, view);
        else buttons.delete(ui);
      }
      if (buttons.size === 0) buttonsByTweet.delete(tweetId);
    };

    const clearTask = (tweetId: string) => {
      const entry = tasks.get(tweetId);
      if (!entry) return;
      if (entry.doneTimer !== undefined) clearTimeout(entry.doneTimer);
      tweetByRequest.delete(entry.task.requestId);
      tasks.delete(tweetId);
    };

    const send = async (msg: ToBackground): Promise<boolean> => {
      try {
        await browser.runtime.sendMessage(msg);
        return true;
      } catch (err) {
        // background 不回复时 Chrome 可能报「message port closed」，不算失败；
        // 扩展被重载后会报「Extension context invalidated」，必须让用户刷新页面
        return /message port closed/i.test(String(err));
      }
    };

    /** 本地判一个请求失败（发送失败、超时），之后到达的该请求消息一律丢弃 */
    const failLocally = (tweetId: string, message: string) => {
      const entry = tasks.get(tweetId);
      if (!entry) return;
      tweetByRequest.delete(entry.task.requestId);
      entry.task = applyMessage(entry.task, {
        target: 'content',
        type: 'job:error',
        requestId: entry.task.requestId,
        message,
      });
      refresh(tweetId);
    };

    const start = async (tweetId: string, sources: GifSource[]) => {
      clearTask(tweetId);
      const requestId = crypto.randomUUID();
      tasks.set(tweetId, { task: createTask(requestId, sources), lastEventAt: Date.now() });
      tweetByRequest.set(requestId, tweetId);
      // 点击后立即显示排队转圈，不等 background 回应
      refresh(tweetId);
      const ok = await send({ target: 'background', type: 'job:start', requestId, sources });
      if (!ok) failLocally(tweetId, '扩展已更新，请刷新页面后重试');
    };

    const cancel = (tweetId: string) => {
      const entry = tasks.get(tweetId);
      if (!entry) return;
      const { requestId } = entry.task;
      // 立即回到空闲，不等 background 确认；background 会丢弃该请求后续的结果、不再下载
      clearTask(tweetId);
      refresh(tweetId);
      void send({ target: 'background', type: 'job:cancel', requestId });
    };

    const onClick = (container: Element) => {
      // 点击时重新识别一次，拿到最新的 GIF 列表（懒加载可能刚补上 src）
      const target = findTargets().find((t) => t.container === container);
      if (!target) return;
      const tweetId = tweetIdOf(target);
      const now = Date.now();
      if (now - (lastClickAt.get(tweetId) ?? 0) < CLICK_DEBOUNCE_MS) return;
      lastClickAt.set(tweetId, now);

      const entry = tasks.get(tweetId);
      switch (viewOf(entry?.task ?? null).kind) {
        case 'idle':
        case 'done':
          void start(tweetId, target.sources);
          return;
        case 'queued':
        case 'progress':
          cancel(tweetId);
          return;
        case 'error':
          void start(tweetId, entry ? failedSources(entry.task) : target.sources);
          return;
      }
    };

    const onJobMessage = (msg: unknown) => {
      if (!isToContent(msg)) return;
      const tweetId = tweetByRequest.get(msg.requestId);
      const entry = tweetId ? tasks.get(tweetId) : undefined;
      if (!tweetId || !entry) return;
      entry.task = applyMessage(entry.task, msg as ToContent);
      entry.lastEventAt = Date.now();
      if (isSettled(entry.task)) {
        // 结束后不再接收该请求的消息；失败保持显示直到用户点击重试，完成 3 秒后回到空闲
        tweetByRequest.delete(entry.task.requestId);
        if (viewOf(entry.task).kind === 'done') {
          entry.doneTimer = window.setTimeout(() => {
            if (tasks.get(tweetId) !== entry) return;
            clearTask(tweetId);
            refresh(tweetId);
          }, DONE_DISPLAY_MS);
        }
      }
      refresh(tweetId);
    };
    browser.runtime.onMessage.addListener(onJobMessage);

    ctx.setInterval(() => {
      const now = Date.now();
      for (const [tweetId, entry] of tasks) {
        if (!isRunning(entry.task) || now - entry.lastEventAt < STALL_TIMEOUT_MS) continue;
        void send({ target: 'background', type: 'job:cancel', requestId: entry.task.requestId });
        failLocally(tweetId, '转换超时');
      }
    }, WATCHDOG_INTERVAL_MS);

    // ---------- 挂载 ----------

    const mount = (target: GifTarget) => {
      const { container, actionBar } = target;
      const tweetId = tweetIdOf(target);
      const ui = mountSaveButton(ctx, actionBar, () => onClick(container), currentView(tweetId))
        .then((button) => {
          const set = buttonsByTweet.get(tweetId) ?? new Set<SaveButton>();
          set.add(button);
          buttonsByTweet.set(tweetId, set);
          // 挂载是异步的，期间状态可能已变化
          renderButton(button, currentView(tweetId));
          return button;
        })
        .catch((err) => {
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

    // 按钮 UI 与 ctx.setInterval 随 ctx 失效由 WXT 自动清理；这里停掉观察和监听
    ctx.onInvalidated(() => {
      observer.disconnect();
      browser.runtime.onMessage.removeListener(onJobMessage);
      for (const tweetId of [...tasks.keys()]) clearTask(tweetId);
    });
  },
});
