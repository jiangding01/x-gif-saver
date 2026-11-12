// background（Service Worker）：任务调度中心。
//   - 接收 content script 的下载请求 → 读设置、生成 Job → 交给 offscreen
//   - 转发 offscreen 的进度/结果给发起请求的标签页（带上 requestId + mediaId，content 据此找到按钮）
//   - 用 chrome.downloads 落盘，下载结束后通知 offscreen 回收 blob URL
//
// SW 可能在转换途中被回收（风险 R3）：任务表与已取消的请求存进 storage.session，重启后从中恢复，
// 否则进度消息无处转发、转好的 GIF 也不会下载。content 另有超时兜底。

import { browser, defineBackground, storage } from '#imports';
import { renderFilename } from '../core/filename';
import { isToBackground, type ToContent, type ToOffscreen } from '../core/messages';
import { resolvePreset, settingsItem } from '../core/settings';
import type { Job } from '../core/types';

type JobMeta = { tabId: number; filename: string; requestId: string; mediaId: string };
type Persisted = { jobs: Record<string, JobMeta>; cancelled: string[] };

const OFFSCREEN_PATH = '/offscreen.html';
/** 已取消请求最多记多少个（只为挡住取消后迟到的结果，不需要长期保留） */
const MAX_CANCELLED = 50;

const persistedItem = storage.defineItem<Persisted>('session:jobs', {
  fallback: { jobs: {}, cancelled: [] },
});

export default defineBackground(() => {
  const jobs = new Map<string, JobMeta>();
  const cancelled = new Set<string>();
  const blobByDownloadId = new Map<number, string>();
  /** 待下载的 blob URL → 文件名，供 onDeterminingFilename 认领自己的下载 */
  const filenameByBlobUrl = new Map<string, string>();
  let creating: Promise<void> | null = null;

  // 启动时恢复；所有消息处理都先等它完成
  const restored = persistedItem
    .getValue()
    .then((saved) => {
      for (const [id, meta] of Object.entries(saved.jobs)) jobs.set(id, meta);
      for (const id of saved.cancelled) cancelled.add(id);
    })
    // 读不到就当没有旧任务，不能让之后的所有消息都卡在 await 上
    .catch(() => {});
  const persist = () =>
    void persistedItem
      .setValue({ jobs: Object.fromEntries(jobs), cancelled: [...cancelled] })
      .catch(() => {});
  const forgetJob = (jobId: string) => {
    jobs.delete(jobId);
    persist();
  };

  const ensureOffscreen = async () => {
    const url = browser.runtime.getURL(OFFSCREEN_PATH);
    const existing = await browser.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url],
    });
    if (existing.length > 0) return;
    creating ??= browser.offscreen
      .createDocument({
        url,
        reasons: ['WORKERS', 'BLOBS'],
        justification: '在 Worker 中把 MP4 转码为 GIF，并生成 blob URL 供下载',
      })
      .finally(() => {
        creating = null;
      });
    await creating;
  };

  const toOffscreen = async (msg: ToOffscreen) => {
    await ensureOffscreen();
    await browser.runtime.sendMessage(msg);
  };

  const toTabId = (tabId: number, msg: ToContent) => {
    void browser.tabs.sendMessage(tabId, msg).catch(() => {});
  };

  const cancelRequest = async (requestId: string) => {
    cancelled.add(requestId);
    while (cancelled.size > MAX_CANCELLED) {
      const oldest = cancelled.values().next().value;
      if (oldest === undefined) break;
      cancelled.delete(oldest);
    }
    for (const [jobId, meta] of jobs) {
      if (meta.requestId !== requestId) continue;
      jobs.delete(jobId);
      await toOffscreen({ target: 'offscreen', type: 'job:cancel', jobId }).catch(() => {});
    }
    persist();
  };

  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    if (!isToBackground(msg)) return;
    void (async () => {
      await restored;
      switch (msg.type) {
        case 'job:start': {
          const tabId = sender.tab?.id;
          if (tabId === undefined) return;
          const { requestId } = msg;
          try {
            const settings = await settingsItem.getValue();
            const preset = resolvePreset(settings, msg.presetId);
            const total = msg.sources.length;
            for (const [i, source] of msg.sources.entries()) {
              // 用户在 background 处理期间已取消：剩下的 GIF 不再开始
              if (cancelled.has(requestId)) return;
              const job: Job = {
                id: crypto.randomUUID(),
                source,
                preset,
                filename: renderFilename(
                  settings.filenameTemplate,
                  settings.subfolder,
                  source,
                  i + 1,
                  total,
                ),
              };
              jobs.set(job.id, {
                tabId,
                filename: job.filename,
                requestId,
                mediaId: source.mediaId,
              });
              persist();
              toTabId(tabId, {
                target: 'content',
                type: 'job:queued',
                requestId,
                mediaId: source.mediaId,
              });
              await toOffscreen({ target: 'offscreen', type: 'job:run', job });
              // 派发期间（例如等 offscreen 创建）用户取消了：取消时 offscreen 还不认识这个 job，这里补发
              if (cancelled.has(requestId)) {
                await toOffscreen({ target: 'offscreen', type: 'job:cancel', jobId: job.id });
                return;
              }
            }
          } catch (err) {
            // 读设置失败、offscreen 创建失败等：整个请求判失败（已派发的也取消），不能让按钮停在「排队」
            await cancelRequest(requestId);
            toTabId(tabId, {
              target: 'content',
              type: 'job:error',
              requestId,
              message: `无法启动转换：${err instanceof Error ? err.message : String(err)}`,
            });
          }
          return;
        }
        case 'job:cancel':
          await cancelRequest(msg.requestId);
          return;
        case 'job:progress': {
          const meta = jobs.get(msg.jobId);
          if (!meta) return;
          toTabId(meta.tabId, {
            target: 'content',
            type: 'job:progress',
            requestId: meta.requestId,
            mediaId: meta.mediaId,
            stage: msg.stage,
            ratio: msg.ratio,
          });
          return;
        }
        case 'job:error': {
          const meta = jobs.get(msg.jobId);
          if (!meta) return;
          forgetJob(msg.jobId);
          toTabId(meta.tabId, {
            target: 'content',
            type: 'job:error',
            requestId: meta.requestId,
            mediaId: meta.mediaId,
            message: msg.message,
          });
          return;
        }
        case 'job:done': {
          const meta = jobs.get(msg.jobId);
          // 找不到：已取消（取消时已移出任务表），或任务表丢失。都不下载，只回收 blob
          if (!meta || cancelled.has(meta.requestId)) {
            if (meta) forgetJob(msg.jobId);
            await toOffscreen({ target: 'offscreen', type: 'blob:revoke', blobUrl: msg.blobUrl });
            return;
          }
          forgetJob(msg.jobId);
          // 先登记再下载：onDeterminingFilename 可能早于 download() 返回 downloadId 触发
          filenameByBlobUrl.set(msg.blobUrl, meta.filename);
          try {
            const downloadId = await browser.downloads.download({
              url: msg.blobUrl,
              filename: meta.filename,
              conflictAction: 'uniquify',
            });
            blobByDownloadId.set(downloadId, msg.blobUrl);
            toTabId(meta.tabId, {
              target: 'content',
              type: 'job:done',
              requestId: meta.requestId,
              mediaId: meta.mediaId,
              params: msg.params,
            });
          } catch (err) {
            filenameByBlobUrl.delete(msg.blobUrl);
            await toOffscreen({ target: 'offscreen', type: 'blob:revoke', blobUrl: msg.blobUrl });
            toTabId(meta.tabId, {
              target: 'content',
              type: 'job:error',
              requestId: meta.requestId,
              mediaId: meta.mediaId,
              message: `保存失败：${err instanceof Error ? err.message : String(err)}`,
            });
          }
          return;
        }
      }
    })();
  });

  // 其他扩展（如下载管理类扩展）监听了 onDeterminingFilename 时，Chrome 会忽略 download() 传入的
  // filename，退回 blob URL 的默认名（UUID，实测存到了下载根目录）。所以自己也监听：只给自己发起的下载
  // 指定文件名，别人的下载调用空 suggest() 不表态；多个扩展都指定时以最后安装的为准
  browser.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const filename = filenameByBlobUrl.get(item.url);
    if (!filename) {
      suggest();
      return;
    }
    filenameByBlobUrl.delete(item.url);
    suggest({ filename, conflictAction: 'uniquify' });
  });

  // 工具栏按钮：打开设置页；已打开时 Chrome 会切到那个标签页，不会重复开
  browser.action.onClicked.addListener(() => {
    void browser.runtime.openOptionsPage();
  });

  browser.downloads.onChanged.addListener((delta) => {
    const state = delta.state?.current;
    if (state !== 'complete' && state !== 'interrupted') return;
    const blobUrl = blobByDownloadId.get(delta.id);
    if (!blobUrl) return;
    blobByDownloadId.delete(delta.id);
    // 下载在 onDeterminingFilename 之前就中断时，登记的文件名不会被认领，这里一并清掉
    filenameByBlobUrl.delete(blobUrl);
    void toOffscreen({ target: 'offscreen', type: 'blob:revoke', blobUrl });
  });
});
