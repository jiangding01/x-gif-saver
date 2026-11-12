import { describe, expect, it } from 'vitest';
import type { ToContent } from '../core/messages';
import type { FinalParams, GifSource } from '../core/types';
import {
  applyMessage,
  createTask,
  failedSources,
  formatBytes,
  isRunning,
  isSettled,
  type Task,
  viewOf,
} from './state';

const source = (mediaId: string): GifSource => ({
  mediaId,
  mp4Url: `https://video.twimg.com/tweet_video/${mediaId}.mp4`,
  author: 'alice',
  tweetId: '111',
});
const params = (bytes: number): FinalParams => ({
  width: 480,
  height: 480,
  fps: 20,
  colors: 255,
  frameCount: 179,
  bytes,
});

const R = 'req-1';
const progress = (mediaId: string, ratio: number): ToContent => ({
  target: 'content',
  type: 'job:progress',
  requestId: R,
  mediaId,
  stage: 'encoding',
  ratio,
});
const done = (mediaId: string, bytes = 1_802_000): ToContent => ({
  target: 'content',
  type: 'job:done',
  requestId: R,
  mediaId,
  params: params(bytes),
});
const error = (message: string, mediaId?: string): ToContent => ({
  target: 'content',
  type: 'job:error',
  requestId: R,
  message,
  ...(mediaId === undefined ? {} : { mediaId }),
});
const apply = (task: Task, ...msgs: ToContent[]) => msgs.reduce(applyMessage, task);

describe('viewOf：单个 GIF', () => {
  const task = createTask(R, [source('A')]);

  it('没有任务 → 空闲；刚点击 → 排队（不等 background 回应）', () => {
    expect(viewOf(null)).toMatchObject({ kind: 'idle', label: '保存为 GIF，右键可选预设' });
    expect(viewOf(task)).toMatchObject({ kind: 'queued', label: '排队中，点击取消' });
  });

  it('进度 → 进度环与百分比；完成 → ✓ 与体积、尺寸、帧率', () => {
    // 编码阶段 42% → 总进度 10% + 42% × 80% ≈ 43.6%（下载占前 10%，降级重编码占最后 10%）
    const view = viewOf(apply(task, progress('A', 0.42)));
    expect(view.kind).toBe('progress');
    expect(view.ratio).toBeCloseTo(0.436);
    expect(view.label).toBe('转换中 43%，点击取消');
    expect(viewOf(apply(task, progress('A', 0.5), done('A')))).toMatchObject({
      kind: 'done',
      label: '已保存 1.7MB · 480×480 · 20fps',
    });
  });

  it('失败 → 显示原因并提示重试；完成后迟到的进度不会改回转换中', () => {
    expect(viewOf(apply(task, error('下载 GIF 视频失败：HTTP 404', 'A')))).toMatchObject({
      kind: 'error',
      label: '失败：下载 GIF 视频失败：HTTP 404，点击重试',
    });
    expect(viewOf(apply(task, done('A'), progress('A', 0.3))).kind).toBe('done');
  });

  it('其他请求的消息不影响本任务', () => {
    const other: ToContent = { ...done('A'), requestId: 'req-2' } as ToContent;
    expect(viewOf(apply(task, other)).kind).toBe('queued');
  });
});

describe('viewOf：同一推文多个 GIF', () => {
  const task = createTask(R, [source('A'), source('B')]);

  it('进度取平均（已完成的按 100% 计）', () => {
    // A 完成按 1 计；B 编码 50% → 0.1 + 0.5 × 0.8 = 0.5，平均 0.75
    const view = viewOf(apply(task, done('A', 500_000), progress('B', 0.5)));
    expect(view.kind).toBe('progress');
    expect(view.ratio).toBeCloseTo(0.75);
  });

  it('全部完成才显示 ✓，提示合计体积', () => {
    expect(viewOf(apply(task, done('A', 500_000))).kind).toBe('progress');
    expect(viewOf(apply(task, done('A', 500_000), done('B', 700_000)))).toMatchObject({
      kind: 'done',
      label: '已保存 2 个 GIF · 共 1.1MB',
    });
  });

  it('一个失败、其余结束后显示失败；重试只重跑失败项', () => {
    const halfFailed = apply(task, error('超时', 'B'));
    // 另一个还在排队：失败的按已结束计入，整体显示 50% 进度，等全部结束再显示失败
    expect(viewOf(halfFailed)).toMatchObject({ kind: 'progress', ratio: 0.5 });
    const settled = apply(halfFailed, done('A'));
    expect(isSettled(settled)).toBe(true);
    expect(viewOf(settled)).toMatchObject({
      kind: 'error',
      label: '1 个 GIF 失败：超时，点击重试',
    });
    expect(failedSources(settled).map((s) => s.mediaId)).toEqual(['B']);
  });

  it('不带 mediaId 的错误让整个请求失败（例如 background 启动失败）', () => {
    const failed = apply(task, done('A'), error('无法启动转换'));
    expect(failedSources(failed).map((s) => s.mediaId)).toEqual(['B']);
    expect(viewOf(failed).label).toContain('无法启动转换');
  });
});

describe('右键菜单选的预设', () => {
  const picked = { id: 'sticker', name: '表情包' };

  it('完成提示带上预设名；默认预设不带', () => {
    const task = createTask(R, [source('A')], picked);
    expect(viewOf(apply(task, done('A')))).toMatchObject({
      label: '已保存（表情包）1.7MB · 480×480 · 20fps',
    });
    const two = createTask(R, [source('A'), source('B')], picked);
    expect(viewOf(apply(two, done('A'), done('B'))).label).toBe(
      '已保存（表情包）2 个 GIF · 共 3.4MB',
    );
    expect(createTask(R, [source('A')])).not.toHaveProperty('preset');
  });

  it('任务记住预设，失败重试可以沿用', () => {
    const task = apply(createTask(R, [source('A')], picked), error('网络错误', 'A'));
    expect(task.preset).toEqual(picked);
    expect(failedSources(task).map((s) => s.mediaId)).toEqual(['A']);
  });
});

describe('目标体积（M2-4）', () => {
  const withTarget = (bytes: number, colors: number, target: FinalParams['target']): ToContent => ({
    target: 'content',
    type: 'job:done',
    requestId: R,
    mediaId: 'A',
    params: { ...params(bytes), width: 240, height: 240, fps: 10, colors, target },
  });
  const MB = 1024 * 1024;

  it('降级重编码时提示压缩中', () => {
    const task = apply(createTask(R, [source('A')]), {
      target: 'content',
      type: 'job:progress',
      requestId: R,
      mediaId: 'A',
      stage: 'shrinking',
      ratio: 0.5,
    });
    expect(viewOf(task).label).toBe('超出体积上限，压缩中 95%，点击取消');
  });

  it('首次就达标：提示不变', () => {
    const task = apply(
      createTask(R, [source('A')]),
      withTarget(900_000, 127, { limit: MB, met: true, degraded: false }),
    );
    expect(viewOf(task).label).toBe('已保存 879KB · 240×240 · 10fps');
  });

  it('降级后达标：带上最终颜色数并说明降低了画质', () => {
    const task = apply(
      createTask(R, [source('A')], { id: 'sticker', name: '表情包' }),
      withTarget(900_000, 63, { limit: MB, met: true, degraded: true }),
    );
    expect(viewOf(task).label).toBe(
      '已保存（表情包）879KB · 240×240 · 10fps · 63 色（已降低画质压到 1MB 以内）',
    );
  });

  it('上限按设置页的 MB 显示，不换算成 KB', () => {
    const task = apply(
      createTask(R, [source('A')]),
      withTarget(121 * 1024, 63, { limit: 0.1 * MB, met: false, degraded: true }),
    );
    expect(viewOf(task).label).toBe(
      '已保存 121KB · 240×240 · 10fps · 63 色（未能压到 0.1MB 以内）',
    );
  });

  it('压不下来：明确提示未能压到上限以内', () => {
    const task = apply(
      createTask(R, [source('A')]),
      withTarget(1.4 * MB, 63, { limit: MB, met: false, degraded: true }),
    );
    expect(viewOf(task)).toMatchObject({
      kind: 'done',
      label: '已保存 1.4MB · 240×240 · 10fps · 63 色（未能压到 1MB 以内）',
    });
  });
});

describe('isRunning：看门狗只盯已开始转换的任务', () => {
  it('排队中不算，收到进度后才算，结束后不算', () => {
    const task = createTask(R, [source('A')]);
    expect(isRunning(task)).toBe(false);
    expect(isRunning(apply(task, progress('A', 0)))).toBe(true);
    expect(isRunning(apply(task, progress('A', 0.5), done('A')))).toBe(false);
  });

  it('多 GIF：一个已完成、另一个仍排队也算（按钮显示进度环，丢消息同样会卡住）', () => {
    const task = createTask(R, [source('A'), source('B')]);
    expect(isRunning(apply(task, done('A')))).toBe(true);
  });
});

describe('进度跨阶段单调', () => {
  const stage = (
    s: 'fetching' | 'decoding' | 'encoding' | 'shrinking',
    ratio: number,
  ): ToContent => ({
    target: 'content',
    type: 'job:progress',
    requestId: R,
    mediaId: 'A',
    stage: s,
    ratio,
  });

  it('下载 100% 之后进入解码、编码、降级重编码，总进度不回退', () => {
    const task = createTask(R, [source('A')]);
    const ratios = [
      stage('fetching', 0),
      stage('fetching', 1),
      stage('decoding', 0),
      stage('encoding', 0),
      stage('encoding', 0.5),
      stage('encoding', 1),
      stage('shrinking', 0),
      stage('shrinking', 0.5),
      stage('shrinking', 1),
    ].reduce<number[]>((acc, _msg, i, all) => {
      const t = apply(task, ...all.slice(0, i + 1));
      acc.push(viewOf(t).ratio);
      return acc;
    }, []);
    expect(ratios.every((r, i) => i === 0 || r >= (ratios[i - 1] as number))).toBe(true);
    expect(ratios.at(-1)).toBe(1);
  });

  it('请求级错误之后迟到的进度不会把失败改回转换中', () => {
    const task = createTask(R, [source('A')]);
    expect(viewOf(apply(task, error('无法启动转换'), progress('A', 0.5))).kind).toBe('error');
  });
});

describe('formatBytes', () => {
  it('小于 1MB 用 KB，否则 MB 保留一位小数', () => {
    expect(formatBytes(118_394)).toBe('116KB');
    expect(formatBytes(1_719_233)).toBe('1.6MB');
    expect(formatBytes(15_672_643)).toBe('14.9MB');
    expect(formatBytes(10)).toBe('1KB');
  });
});
