// 三个上下文之间的消息协议。数据流见 docs/TECH-DESIGN.md「架构」。
//
//   content script ──start/cancel──▶ background ──run/cancel/revoke──▶ offscreen
//   content script ◀──progress/done/error── background ◀──progress/done/error── offscreen
//
// runtime.sendMessage 是广播，所以每条消息带 target 字段，接收方用下面的类型守卫过滤。
// 一次点击 = 一个请求（requestId），可能包含多个 GIF（每个 GIF 一个 job）。content 只认 requestId + mediaId，
// 不需要知道 jobId；取消也按 requestId 整体取消。

import type { FinalParams, GifSource, Job, JobStage } from './types';

export type ToBackground =
  | {
      target: 'background';
      type: 'job:start';
      requestId: string;
      sources: GifSource[];
      presetId?: string;
    }
  | { target: 'background'; type: 'job:cancel'; requestId: string }
  | { target: 'background'; type: 'job:progress'; jobId: string; stage: JobStage; ratio: number }
  | { target: 'background'; type: 'job:done'; jobId: string; blobUrl: string; params: FinalParams }
  | { target: 'background'; type: 'job:error'; jobId: string; message: string };

export type ToOffscreen =
  | { target: 'offscreen'; type: 'job:run'; job: Job }
  | { target: 'offscreen'; type: 'job:cancel'; jobId: string }
  | { target: 'offscreen'; type: 'blob:revoke'; blobUrl: string };

/** background → content script（经 tabs.sendMessage 发给发起请求的标签页） */
export type ToContent =
  | { target: 'content'; type: 'job:queued'; requestId: string; mediaId: string }
  | {
      target: 'content';
      type: 'job:progress';
      requestId: string;
      mediaId: string;
      stage: JobStage;
      ratio: number;
    }
  | { target: 'content'; type: 'job:done'; requestId: string; mediaId: string; params: FinalParams }
  /** mediaId 缺省表示整个请求失败（例如 background 读设置出错），所有未完成的 GIF 都算失败 */
  | { target: 'content'; type: 'job:error'; requestId: string; mediaId?: string; message: string };

const targetIs = (msg: unknown, target: string): boolean =>
  typeof msg === 'object' && msg !== null && (msg as { target?: unknown }).target === target;

export const isToBackground = (msg: unknown): msg is ToBackground => targetIs(msg, 'background');
export const isToOffscreen = (msg: unknown): msg is ToOffscreen => targetIs(msg, 'offscreen');
export const isToContent = (msg: unknown): msg is ToContent => targetIs(msg, 'content');
