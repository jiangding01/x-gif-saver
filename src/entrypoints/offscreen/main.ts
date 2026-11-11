// offscreen 文档：扩展自己的 origin，不受 x.com CSP 限制，负责持有 Worker、排队执行任务、生成 blob URL。
// offscreen 只能使用 runtime 消息 API，下载交给 background 的 chrome.downloads。

import { browser } from '#imports';
import { isToOffscreen, type ToBackground } from '../../core/messages';
import type { Job } from '../../core/types';
import type { WorkerIn, WorkerOut } from '../../pipeline/worker';

const queue: Job[] = [];
let running: string | null = null;

const toBackground = (msg: ToBackground) => browser.runtime.sendMessage(msg);

const pump = () => {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = next.id;
  toWorker({ type: 'run', job: next });
};

const onWorkerMessage = (event: MessageEvent<WorkerOut>) => {
  const msg = event.data;
  if (msg.type === 'progress') {
    void toBackground({
      target: 'background',
      type: 'job:progress',
      jobId: msg.jobId,
      stage: msg.stage,
      ratio: msg.ratio,
    });
    return;
  }
  if (msg.type === 'done') {
    const blobUrl = URL.createObjectURL(new Blob([msg.bytes as BlobPart], { type: 'image/gif' }));
    void toBackground({
      target: 'background',
      type: 'job:done',
      jobId: msg.jobId,
      blobUrl,
      params: msg.params,
    });
  } else {
    void toBackground({
      target: 'background',
      type: 'job:error',
      jobId: msg.jobId,
      message: msg.message,
    });
  }
  running = null;
  pump();
};

// Worker 崩溃（未捕获异常、内存不足、脚本加载失败）时不会再发消息：
// 把当前任务判失败、换一个新 Worker，否则 running 永远不清空，后续任务全部卡住。
const createWorker = (): Worker => {
  const w = new Worker(new URL('../../pipeline/worker.ts', import.meta.url), { type: 'module' });
  w.addEventListener('message', onWorkerMessage);
  w.addEventListener('error', (event) => {
    event.preventDefault();
    w.terminate();
    worker = createWorker();
    if (running) {
      const jobId = running;
      running = null;
      void toBackground({
        target: 'background',
        type: 'job:error',
        jobId,
        message: `转换进程异常退出：${event.message || '未知错误'}`,
      });
    }
    pump();
  });
  return w;
};

let worker = createWorker();
const toWorker = (msg: WorkerIn) => worker.postMessage(msg);

browser.runtime.onMessage.addListener((msg: unknown) => {
  if (!isToOffscreen(msg)) return;
  switch (msg.type) {
    case 'job:run':
      queue.push(msg.job);
      pump();
      break;
    case 'job:cancel': {
      const i = queue.findIndex((j) => j.id === msg.jobId);
      if (i >= 0) {
        queue.splice(i, 1);
        void toBackground({
          target: 'background',
          type: 'job:error',
          jobId: msg.jobId,
          message: '已取消',
        });
      } else if (running === msg.jobId) {
        toWorker({ type: 'cancel', jobId: msg.jobId });
      }
      break;
    }
    case 'blob:revoke':
      URL.revokeObjectURL(msg.blobUrl);
      break;
  }
});
