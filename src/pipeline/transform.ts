// 变换（ROADMAP M1-3）：输出尺寸与抽帧计划。纯函数，不依赖 WebCodecs 和画布。

import { delaysFromTimestamps } from './timing';

/**
 * 抽帧比较时间时的容差 = 单个时间戳按 1/100 秒取整的最大误差（0.5cs）。
 * 不留容差的话，帧率上限等于原帧率时，取整后略早于目标时刻的帧会被误丢（实测 65 帧只剩 44 帧）。
 * 每保留一帧至少消耗一个目标时刻，所以平均帧率不会超过上限
 */
const SAMPLE_TOLERANCE_US = 5_000;

/** 最长边超过 maxSide 时等比缩小（不放大），四舍五入、下限 1。GIF 没有偶数宽高的要求 */
export const fitSize = (
  width: number,
  height: number,
  maxSide: number | null,
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (maxSide === null || longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/**
 * 抽帧计划：保留哪些帧、每帧延迟多少厘秒。解码前就能算好，解码时按 VideoFrame.timestamp 查表。
 *
 * fpsCap 低于原帧率时按时间戳抽帧：第 k 个目标时刻为 round(k × 1e6 / fpsCap)，
 * 保留第一个「时间戳 + 0.5cs 容差 ≥ 当前目标时刻」的帧，再把目标推进到它之后
 * （整数序号，不累加浮点，避免漂移误丢帧）。
 *
 * @param timestampsUs 全部帧的显示时间（微秒），顺序不限，首帧应为 0（demux 已归零）
 * @returns 时间戳 → 延迟（厘秒），按显示顺序插入
 */
export const planFrames = (
  timestampsUs: readonly number[],
  durationUs: number,
  fpsCap: number | null,
): Map<number, number> => {
  const sorted = [...timestampsUs].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) throw new Error(`duplicate frame timestamp: ${sorted[i]}µs`);
  }

  let kept = sorted;
  if (fpsCap !== null && fpsCap > 0) {
    const targetOf = (k: number) => Math.round((k * 1_000_000) / fpsCap);
    kept = [];
    let k = 0;
    for (const ts of sorted) {
      const reach = ts + SAMPLE_TOLERANCE_US;
      if (reach < targetOf(k)) continue;
      kept.push(ts);
      while (targetOf(k) <= reach) k++;
    }
  }

  const delays = delaysFromTimestamps(kept, durationUs);
  return new Map(kept.map((ts, i) => [ts, delays[i] as number]));
};
