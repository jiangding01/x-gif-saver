import { describe, expect, it } from 'vitest';
import { fitSize, planFrames } from './transform';

describe('fitSize', () => {
  it('maxSide 为 null 或不超过上限时保持原尺寸（含奇数）', () => {
    expect(fitSize(481, 271, null)).toEqual({ width: 481, height: 271 });
    expect(fitSize(468, 468, 480)).toEqual({ width: 468, height: 468 });
    expect(fitSize(480, 480, 480)).toEqual({ width: 480, height: 480 });
  });

  it('只缩小不放大，按最长边等比缩放', () => {
    expect(fitSize(1280, 720, 480)).toEqual({ width: 480, height: 270 });
    expect(fitSize(720, 1280, 480)).toEqual({ width: 270, height: 480 });
    expect(fitSize(500, 333, 320)).toEqual({ width: 320, height: 213 });
  });

  it('极端细长图的短边下限为 1', () => {
    expect(fitSize(4000, 2, 320)).toEqual({ width: 320, height: 1 });
  });
});

const sumOf = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
/** 均匀帧率的时间戳（微秒），按厘秒取整，与 X 的 1/100 秒时间单位一致 */
const evenTimestamps = (count: number, fps: number) =>
  Array.from({ length: count }, (_, k) => Math.round((k * 100) / fps) * 10_000);

describe('planFrames', () => {
  it('真实样本（15fps、65 帧、容器时长 434cs）不限帧率：全保留，延迟总和 434cs', () => {
    // 与 HWz0LgxbUAEtAWN.mp4 解析出的时间戳逐个相同：0, 7, 13, 20 … 427 厘秒
    const plan = planFrames(evenTimestamps(65, 15), 4_340_000, null);
    expect(plan.size).toBe(65);
    expect(sumOf(plan)).toBe(434);
    expect([...plan.keys()][0]).toBe(0);
  });

  it('15fps 限到 10fps：约保留 2/3，延迟总和不变', () => {
    const plan = planFrames(evenTimestamps(65, 15), 4_340_000, 10);
    expect(plan.size).toBeGreaterThanOrEqual(43);
    expect(plan.size).toBeLessThanOrEqual(44);
    expect(sumOf(plan)).toBe(434);
    expect([...plan.values()].every((d) => d >= 2)).toBe(true);
  });

  it('30fps 限到 15fps：每隔一帧保留，不因浮点误差漏帧', () => {
    // 30fps 的第 4 帧在 133333µs，略小于 4 × 1e6/30 的浮点值，累加浮点目标时会被误丢
    const ts = Array.from({ length: 30 }, (_, k) => Math.round((k * 1_000_000) / 30));
    const plan = planFrames(ts, 1_000_000, 15);
    expect([...plan.keys()]).toEqual(ts.filter((_, k) => k % 2 === 0));
    expect(sumOf(plan)).toBe(100);
  });

  it('高帧率限速：每秒保留帧数不超过上限', () => {
    const fps60 = Array.from({ length: 120 }, (_, k) => Math.round((k * 1_000_000) / 60));
    expect(planFrames(fps60, 2_000_000, 50).size).toBeLessThanOrEqual(100);
    const fps30 = Array.from({ length: 60 }, (_, k) => Math.round((k * 1_000_000) / 30));
    expect(planFrames(fps30, 2_000_000, 25).size).toBeLessThanOrEqual(50);
    expect(planFrames(fps30, 2_000_000, 25).size).toBeGreaterThanOrEqual(49);
  });

  it('帧率上限不低于原帧率时全保留（时间戳有 ±0.5cs 取整抖动也不误丢）', () => {
    expect(planFrames(evenTimestamps(65, 15), 4_340_000, 15).size).toBe(65);
    expect(planFrames(evenTimestamps(65, 15), 4_340_000, 30).size).toBe(65);
  });

  it('输入乱序（解码顺序）也按显示顺序规划', () => {
    const plan = planFrames([0, 200_000, 100_000, 300_000], 400_000, null);
    expect([...plan.keys()]).toEqual([0, 100_000, 200_000, 300_000]);
    expect(sumOf(plan)).toBe(40);
  });

  it('时间戳重复时报错，避免按时间戳查表时帧数对不上', () => {
    expect(() => planFrames([0, 100_000, 100_000], 300_000, null)).toThrow('时间戳重复');
  });
});
