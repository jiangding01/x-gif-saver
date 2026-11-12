// background（Service Worker）：任务调度中心。
//   - 接收 content script 的下载请求 → 读设置、生成 Job → 交给 offscreen
//   - 转发 offscreen 的进度/结果给发起请求的标签页
//   - 用 chrome.downloads 落盘，下载结束后通知 offscreen 回收 blob URL
//
// 注意：SW 可能被回收，jobs 只存在内存里。转换期间 offscreen 持续发进度消息会让 SW 保持存活；
// 若 M1 实测仍有丢任务的情况，再把 jobs 挪到 storage.session（见 TECH-DESIGN「风险」）。

import { browser, defineBackground } from '#imports';
import { renderFilename } from '../core/filename';
import { isToBackground, type ToContent, type ToOffscreen } from '../core/messages';
import { resolvePreset, settingsItem } from '../core/settings';
import type { Job } from '../core/types';

type JobMeta = { tabId: number; filename: string };

const OFFSCREEN_PATH = '/offscreen.html';

export default defineBackground(() => {
  const jobs = new Map<string, JobMeta>();
  const blobByDownloadId = new Map<number, string>();
  /** 待下载的 blob URL → 文件名，供 onDeterminingFilename 认领自己的下载 */
  const filenameByBlobUrl = new Map<string, string>();
  let creating: Promise<void> | null = null;

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

  const toTab = (jobId: string, msg: ToContent) => {
    const meta = jobs.get(jobId);
    if (meta) void browser.tabs.sendMessage(meta.tabId, msg).catch(() => {});
  };

  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    if (!isToBackground(msg)) return;
    void (async () => {
      switch (msg.type) {
        case 'job:start': {
          const tabId = sender.tab?.id;
          if (tabId === undefined) return;
          const settings = await settingsItem.getValue();
          const preset = resolvePreset(settings, msg.presetId);
          const total = msg.sources.length;
          for (const [i, source] of msg.sources.entries()) {
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
            jobs.set(job.id, { tabId, filename: job.filename });
            toTab(job.id, { type: 'job:queued', jobId: job.id, mediaId: source.mediaId });
            try {
              await toOffscreen({ target: 'offscreen', type: 'job:run', job });
            } catch (err) {
              // offscreen 创建失败或消息送不到：不能让按钮停在「排队」
              toTab(job.id, {
                type: 'job:error',
                jobId: job.id,
                message: `无法启动转换：${String(err)}`,
              });
              jobs.delete(job.id);
            }
          }
          return;
        }
        case 'job:cancel':
          await toOffscreen({ target: 'offscreen', type: 'job:cancel', jobId: msg.jobId });
          return;
        case 'job:progress':
          toTab(msg.jobId, {
            type: 'job:progress',
            jobId: msg.jobId,
            stage: msg.stage,
            ratio: msg.ratio,
          });
          return;
        case 'job:error':
          toTab(msg.jobId, { type: 'job:error', jobId: msg.jobId, message: msg.message });
          jobs.delete(msg.jobId);
          return;
        case 'job:done': {
          const meta = jobs.get(msg.jobId);
          if (!meta) {
            // SW 重启后 jobs 丢失（风险 R3）：至少回收 blob，避免 offscreen 内存泄漏
            await toOffscreen({ target: 'offscreen', type: 'blob:revoke', blobUrl: msg.blobUrl });
            return;
          }
          // 先登记再下载：onDeterminingFilename 可能早于 download() 返回 downloadId 触发
          filenameByBlobUrl.set(msg.blobUrl, meta.filename);
          try {
            const downloadId = await browser.downloads.download({
              url: msg.blobUrl,
              filename: meta.filename,
              conflictAction: 'uniquify',
            });
            blobByDownloadId.set(downloadId, msg.blobUrl);
            toTab(msg.jobId, { type: 'job:done', jobId: msg.jobId, params: msg.params });
          } catch (err) {
            filenameByBlobUrl.delete(msg.blobUrl);
            await toOffscreen({ target: 'offscreen', type: 'blob:revoke', blobUrl: msg.blobUrl });
            toTab(msg.jobId, {
              type: 'job:error',
              jobId: msg.jobId,
              message: `保存失败：${String(err)}`,
            });
          }
          jobs.delete(msg.jobId);
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
