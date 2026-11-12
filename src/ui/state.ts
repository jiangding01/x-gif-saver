// 按钮状态（ROADMAP M1-5）：一次点击 = 一个任务，可能包含同一推文的多个 GIF。
// 纯函数：消息 → 任务状态 → 按钮视图，content script 只负责路由与定时器，便于单测。

import type { ToContent } from '../core/messages';
import { toMB } from '../core/presets';
import type { FinalParams, GifSource, JobStage } from '../core/types';

export type JobPhase = 'queued' | 'running' | 'done' | 'error';

export type JobState = {
  phase: JobPhase;
  /** 0–1，queued 为 0，done 为 1 */
  ratio: number;
  /** 最近一次进度所在阶段：降级重编码（shrinking）时提示文案不同 */
  stage?: JobStage;
  message?: string;
  params?: FinalParams;
};

/** 右键菜单选的非默认预设；未设置表示用默认预设 */
export type PickedPreset = { id: string; name: string };

export type Task = {
  requestId: string;
  sources: GifSource[];
  /** 本次用的非默认预设：完成提示带上它的名字，失败重试也沿用它 */
  preset?: PickedPreset;
  /** mediaId → 状态 */
  jobs: Map<string, JobState>;
};

export type ButtonKind = 'idle' | 'queued' | 'progress' | 'done' | 'error';

export type ButtonView = {
  kind: ButtonKind;
  /** progress 时的 0–1 */
  ratio: number;
  /** 悬停提示与 aria-label */
  label: string;
};

export const IDLE_VIEW: ButtonView = { kind: 'idle', ratio: 0, label: '保存为 GIF，右键可选预设' };

/** 下载阶段在总进度里占的比例；解码与编码由编码器统一上报（两遍遍历，0–1 单调） */
const FETCH_SHARE = 0.1;
/** 第一次编码结束时的总进度；超出目标体积时的降级重编码占最后这一段（M2-4） */
const ENCODE_END = 0.9;

/** 各阶段的进度映射到同一条 0–1 总进度上，保证单调不回退（下载报 1 后解码不会从 0 重新开始） */
export const overallRatio = (stage: JobStage, ratio: number): number => {
  const r = Math.min(1, Math.max(0, ratio));
  switch (stage) {
    case 'queued':
      return 0;
    case 'fetching':
      return r * FETCH_SHARE;
    case 'decoding':
      return FETCH_SHARE;
    case 'shrinking':
      return ENCODE_END + r * (1 - ENCODE_END);
    case 'saving':
      return 1;
    default:
      return FETCH_SHARE + r * (ENCODE_END - FETCH_SHARE);
  }
};

export const createTask = (
  requestId: string,
  sources: GifSource[],
  preset?: PickedPreset,
): Task => ({
  requestId,
  sources,
  ...(preset ? { preset } : {}),
  jobs: new Map(sources.map((s) => [s.mediaId, { phase: 'queued', ratio: 0 }])),
});

/** 应用一条 background 回传的消息；不属于本任务的消息原样返回 */
export const applyMessage = (task: Task, msg: ToContent): Task => {
  if (msg.requestId !== task.requestId) return task;
  const jobs = new Map(task.jobs);
  const set = (mediaId: string, next: (prev: JobState) => JobState) => {
    const prev = jobs.get(mediaId);
    // 已结束的 GIF 不再被后来的消息改写（例如完成后迟到的进度）
    if (!prev || prev.phase === 'done' || prev.phase === 'error') return;
    jobs.set(mediaId, next(prev));
  };
  switch (msg.type) {
    case 'job:queued':
      break;
    case 'job:progress':
      set(msg.mediaId, (prev) => ({
        phase: 'running',
        stage: msg.stage,
        // 只进不退：防止消息乱序或阶段切换时进度环往回跳
        ratio: Math.max(prev.ratio, overallRatio(msg.stage, msg.ratio)),
      }));
      break;
    case 'job:done':
      set(msg.mediaId, () => ({ phase: 'done', ratio: 1, params: msg.params }));
      break;
    case 'job:error':
      if (msg.mediaId !== undefined) {
        set(msg.mediaId, (prev) => ({ ...prev, phase: 'error', message: msg.message }));
      } else {
        for (const id of jobs.keys()) {
          set(id, (prev) => ({ ...prev, phase: 'error', message: msg.message }));
        }
      }
      break;
  }
  return { ...task, jobs };
};

/** 所有 GIF 都已结束（完成或失败） */
export const isSettled = (task: Task): boolean =>
  [...task.jobs.values()].every((j) => j.phase === 'done' || j.phase === 'error');

/**
 * 任务已开始且未结束（看门狗只盯这种任务：全部排队中时收不到消息是正常的）。
 * 多 GIF 时一个已完成、另一个还在排队也算——此时按钮显示进度环，丢了消息同样会卡住
 */
export const isRunning = (task: Task): boolean =>
  !isSettled(task) && [...task.jobs.values()].some((j) => j.phase !== 'queued');

/** 重试时只重跑失败的 GIF */
export const failedSources = (task: Task): GifSource[] =>
  task.sources.filter((s) => task.jobs.get(s.mediaId)?.phase === 'error');

export const formatBytes = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))}KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')}MB`;

/** 目标体积的说明：没压下来要明确告诉用户；降级过要说明画质降低了 */
const targetNote = (params: FinalParams[]): string => {
  const targets = params.map((p) => p.target).filter((t) => t !== undefined);
  const [first] = targets;
  if (!first) return '';
  // 按设置页填写的单位显示（0.1MB 不写成 102KB）
  const limit = `${toMB(first.limit)}MB`;
  const missed = targets.filter((t) => !t.met).length;
  if (missed > 0) {
    return params.length > 1
      ? `（${missed} 个未能压到 ${limit} 以内）`
      : `（未能压到 ${limit} 以内）`;
  }
  return targets.some((t) => t.degraded) ? `（已降低画质压到 ${limit} 以内）` : '';
};

const doneLabel = (jobs: JobState[], preset?: PickedPreset): string => {
  const params = jobs.map((j) => j.params).filter((p): p is FinalParams => p !== undefined);
  const total = formatBytes(params.reduce((sum, p) => sum + p.bytes, 0));
  const saved = preset ? `已保存（${preset.name}）` : '已保存 ';
  const note = targetNote(params);
  const [only] = params;
  if (params.length === 1 && only) {
    // 降级过或没压下来时带上颜色数：最终参数与预设不同
    const colors =
      only.target && (only.target.degraded || !only.target.met) ? ` · ${only.colors} 色` : '';
    return `${saved}${total} · ${only.width}×${only.height} · ${only.fps}fps${colors}${note}`;
  }
  return `${saved}${jobs.length} 个 GIF · 共 ${total}${note}`;
};

export const viewOf = (task: Task | null): ButtonView => {
  if (!task) return IDLE_VIEW;
  const jobs = [...task.jobs.values()];
  if (jobs.every((j) => j.phase === 'done'))
    return { kind: 'done', ratio: 1, label: doneLabel(jobs, task.preset) };
  if (isSettled(task)) {
    const failed = jobs.filter((j) => j.phase === 'error');
    const reason = failed[0]?.message ?? '未知错误';
    const prefix = jobs.length > 1 ? `${failed.length} 个 GIF 失败：` : '失败：';
    return { kind: 'error', ratio: 0, label: `${prefix}${reason}，点击重试` };
  }
  if (jobs.every((j) => j.phase === 'queued')) {
    return { kind: 'queued', ratio: 0, label: '排队中，点击取消' };
  }
  // 已结束的（完成或失败）都按 1 计入平均进度
  const ratio =
    jobs.reduce((sum, j) => sum + (j.phase === 'done' || j.phase === 'error' ? 1 : j.ratio), 0) /
    jobs.length;
  const shrinking = jobs.some((j) => j.phase === 'running' && j.stage === 'shrinking');
  const doing = shrinking ? '超出体积上限，压缩中' : '转换中';
  return { kind: 'progress', ratio, label: `${doing} ${Math.floor(ratio * 100)}%，点击取消` };
};
