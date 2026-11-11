// 三个上下文之间的消息协议。数据流见 docs/TECH-DESIGN.md「架构」。
//
//   content script ──start/cancel──▶ background ──run/cancel/revoke──▶ offscreen
//   content script ◀──progress/done/error── background ◀──progress/done/error── offscreen
//
// offscreen 只能用 runtime 消息，且 runtime.sendMessage 是广播，所以每条消息带 target 字段，接收方按 target 过滤。

import type { FinalParams, GifSource, Job, JobStage } from './types';

export type ToBackground =
  | { target: 'background'; type: 'job:start'; sources: GifSource[]; presetId?: string }
  | { target: 'background'; type: 'job:cancel'; jobId: string }
  | { target: 'background'; type: 'job:progress'; jobId: string; stage: JobStage; ratio: number }
  | { target: 'background'; type: 'job:done'; jobId: string; blobUrl: string; params: FinalParams }
  | { target: 'background'; type: 'job:error'; jobId: string; message: string };

export type ToOffscreen =
  | { target: 'offscreen'; type: 'job:run'; job: Job }
  | { target: 'offscreen'; type: 'job:cancel'; jobId: string }
  | { target: 'offscreen'; type: 'blob:revoke'; blobUrl: string };

/** background → content script（经 tabs.sendMessage 定向发送，不需要 target） */
export type ToContent =
  | { type: 'job:queued'; jobId: string; mediaId: string }
  | { type: 'job:progress'; jobId: string; stage: JobStage; ratio: number }
  | { type: 'job:done'; jobId: string; params: FinalParams }
  | { type: 'job:error'; jobId: string; message: string };

export const isToBackground = (msg: unknown): msg is ToBackground =>
  typeof msg === 'object' && msg !== null && (msg as { target?: unknown }).target === 'background';

export const isToOffscreen = (msg: unknown): msg is ToOffscreen =>
  typeof msg === 'object' && msg !== null && (msg as { target?: unknown }).target === 'offscreen';
