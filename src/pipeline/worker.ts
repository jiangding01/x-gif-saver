// 转换 Worker：由 offscreen 文档创建，一次只跑一个任务（排队在 offscreen 里做）。

import type { FinalParams, Job, JobStage } from '../core/types';
import { runJob } from './run';

export type WorkerIn = { type: 'run'; job: Job } | { type: 'cancel'; jobId: string };

export type WorkerOut =
  | { type: 'progress'; jobId: string; stage: JobStage; ratio: number }
  | { type: 'done'; jobId: string; bytes: Uint8Array; params: FinalParams }
  | { type: 'error'; jobId: string; message: string };

const post = (msg: WorkerOut, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

let current: { jobId: string; abort: AbortController } | null = null;

self.addEventListener('message', async (event: MessageEvent<WorkerIn>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    if (current?.jobId === msg.jobId) current.abort.abort();
    return;
  }

  const { job } = msg;
  const abort = new AbortController();
  current = { jobId: job.id, abort };
  try {
    const { bytes, params } = await runJob(job, abort.signal, (stage, ratio) =>
      post({ type: 'progress', jobId: job.id, stage, ratio }),
    );
    post({ type: 'done', jobId: job.id, bytes, params }, [bytes.buffer]);
  } catch (err) {
    const message = abort.signal.aborted
      ? '已取消'
      : err instanceof Error
        ? err.message
        : String(err);
    post({ type: 'error', jobId: job.id, message });
  } finally {
    current = null;
  }
});
