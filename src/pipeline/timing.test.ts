import { describe, expect, it } from 'vitest';
import { delaysFromTimestamps, MIN_DELAY_CS } from './timing';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const evenTimestamps = (n: number, fps: number) =>
  Array.from({ length: n }, (_, i) => Math.round((i * 1_000_000) / fps));

describe('delaysFromTimestamps', () => {
  it('15fps 不累计误差：65 帧总时长 ≈ 4.33s', () => {
    // 样本：HWz0LgxbUAEtAWN.mp4，65 帧 15fps，duration 4.33s
    const d = delaysFromTimestamps(evenTimestamps(65, 15), 4_330_000);
    expect(d).toHaveLength(65);
    expect(sum(d)).toBe(433);
    expect(new Set(d)).toEqual(new Set([6, 7]));
  });

  it('30fps 交替 3/4cs', () => {
    const d = delaysFromTimestamps(evenTimestamps(30, 30), 1_000_000);
    expect(sum(d)).toBe(100);
  });

  it('高帧率钳到下限，并从后续帧扣回', () => {
    const d = delaysFromTimestamps(evenTimestamps(60, 60), 1_000_000);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(MIN_DELAY_CS);
  });

  it('空输入', () => {
    expect(delaysFromTimestamps([], 0)).toEqual([]);
  });
});
