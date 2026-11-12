// 按钮状态（ROADMAP M1-5）：一次点击 = 一个任务，可能包含同一推文的多个 GIF。
// 纯函数：消息 → 任务状态 → 按钮视图，content script 只负责路由与定时器，便于单测。

import { i18n } from '#i18n';
import type { ToContent } from '../core/messages';
import { toMB } from '../core/presets';
import type { FinalParams, GifSource, JobStage } from '../core/types';
import { describeError } from './errorText';

export type JobPhase = 'queued' | 'running' | 'done' | 'error';

export type JobState = {
  phase: JobPhase;
  /** 0–1，queued 为 0，done 为 1 */
  ratio: number;
  /** 最近一次进度所在阶段：降级重编码（shrinking）时提示文案不同 */
  stage?: JobStage;
  /** 失败原因，收到消息时已翻译成当前语言 */
  message?: string;
  params?: FinalParams;
};

/** 右键菜单选的非默认预设；未设置表示用默认预设。name 是选中时的显示名（内置预设已翻译） */
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
  /** 按钮的悬停提示：状态 + 可执行的操作（点击取消 / 重试） */
  label: string;
  /** 只有状态、不带操作提示，给没有按钮时的底部提示条用 */
  status: string;
  /** aria-label：转换中不带百分比，免得读屏每 1% 朗读一次 */
  aria: string;
};

const makeView = (
  kind: ButtonKind,
  ratio: number,
  status: string,
  label = status,
  aria = label,
) => ({
  kind,
  ratio,
  status,
  label,
  aria,
});

export const idleView = (): ButtonView => makeView('idle', 0, i18n.t('button.idle'));

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
    case 'job:error': {
      const message = describeError(msg.error);
      if (msg.mediaId !== undefined) {
        set(msg.mediaId, (prev) => ({ ...prev, phase: 'error', message }));
      } else {
        for (const id of jobs.keys()) {
          set(id, (prev) => ({ ...prev, phase: 'error', message }));
        }
      }
      break;
    }
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

/** 在 detail 后面加上目标体积的说明：没压下来要明确告诉用户；降级过要说明画质降低了 */
const withTargetNote = (detail: string, params: FinalParams[]): string => {
  const targets = params.map((p) => p.target).filter((t) => t !== undefined);
  const [first] = targets;
  if (!first) return detail;
  // 按设置页填写的单位显示（0.1MB 不写成 102KB）
  const limit = `${toMB(first.limit)}MB`;
  const missed = targets.filter((t) => !t.met).length;
  if (missed > 0) {
    return params.length > 1
      ? i18n.t('button.missedSome', [detail, String(missed), limit])
      : i18n.t('button.missed', [detail, limit]);
  }
  return targets.some((t) => t.degraded) ? i18n.t('button.degraded', [detail, limit]) : detail;
};

const doneLabel = (jobs: JobState[], preset?: PickedPreset): string => {
  const params = jobs.map((j) => j.params).filter((p): p is FinalParams => p !== undefined);
  const total = formatBytes(params.reduce((sum, p) => sum + p.bytes, 0));
  const [only] = params;
  let detail: string;
  if (params.length === 1 && only) {
    // 降级过或没压下来时带上颜色数：最终参数与预设不同
    const colors =
      only.target && (only.target.degraded || !only.target.met)
        ? ` · ${i18n.t('preset.colors', [String(only.colors)])}`
        : '';
    detail = `${total} · ${only.width}×${only.height} · ${only.fps}fps${colors}`;
  } else {
    detail = i18n.t('button.multiple', [String(jobs.length), total]);
  }
  detail = withTargetNote(detail, params);
  return preset
    ? i18n.t('button.savedWithPreset', [preset.name, detail])
    : i18n.t('button.saved', [detail]);
};

export const viewOf = (task: Task | null): ButtonView => {
  if (!task) return idleView();
  const jobs = [...task.jobs.values()];
  if (jobs.every((j) => j.phase === 'done'))
    return makeView('done', 1, doneLabel(jobs, task.preset));
  if (isSettled(task)) {
    const failed = jobs.filter((j) => j.phase === 'error');
    const reason = failed[0]?.message ?? i18n.t('error.unknown');
    const status =
      jobs.length > 1
        ? i18n.t('button.failedSome', [String(failed.length), String(jobs.length), reason])
        : i18n.t('button.failed', [reason]);
    return makeView('error', 0, status, i18n.t('button.clickToRetry', [status]));
  }
  if (jobs.every((j) => j.phase === 'queued')) {
    const status = i18n.t('button.queued');
    return makeView('queued', 0, status, i18n.t('button.clickToCancel', [status]));
  }
  // 已结束的（完成或失败）都按 1 计入平均进度
  const ratio =
    jobs.reduce((sum, j) => sum + (j.phase === 'done' || j.phase === 'error' ? 1 : j.ratio), 0) /
    jobs.length;
  const shrinking = jobs.some((j) => j.phase === 'running' && j.stage === 'shrinking');
  const percent = String(Math.floor(ratio * 100));
  const status = shrinking
    ? i18n.t('button.shrinking', [percent])
    : i18n.t('button.converting', [percent]);
  return makeView(
    'progress',
    ratio,
    status,
    i18n.t('button.clickToCancel', [status]),
    i18n.t('button.clickToCancel', [i18n.t('button.busy')]),
  );
};
