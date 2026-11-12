// 目标体积降级（ROADMAP M2-4，TECH-DESIGN §5.1）：转出来的 GIF 超过预设的 targetBytes 时，
// 按固定顺序逐级降低参数重新编码，最多 4 次。这里只算每一级的参数，纯函数，便于单测；
// 跳过「与上一次效果相同」的级别由 run.ts 按实际尺寸与帧数判断。

import type { Preset } from '../core/types';

export type EncodeParams = Pick<Preset, 'maxSide' | 'fpsCap' | 'colors'>;

/** 降级后最长边不低于这个值（与设置页最长边下限一致） */
export const MIN_SIDE = 64;
const SHRINK = 0.75;

/**
 * 四级降级参数（逐级累加）：
 *   1 颜色数降到 min(当前, 128)
 *   2 帧率上限降到 min(当前, 10)
 *   3 最长边 × 0.75
 *   4 最长边再 × 0.75，颜色数 64
 * @param longSide 第一次编码的实际最长边（已按 maxSide 缩放，不会大于原视频）
 */
export const degradeSteps = (start: EncodeParams, longSide: number): EncodeParams[] => {
  const step1: EncodeParams = { ...start, colors: start.colors === 256 ? 128 : start.colors };
  const step2: EncodeParams = {
    ...step1,
    fpsCap: start.fpsCap === null ? 10 : Math.min(start.fpsCap, 10),
  };
  const side3 = Math.max(MIN_SIDE, Math.round(longSide * SHRINK));
  const step3: EncodeParams = { ...step2, maxSide: side3 };
  const step4: EncodeParams = {
    ...step3,
    maxSide: Math.max(MIN_SIDE, Math.round(side3 * SHRINK)),
    colors: 64,
  };
  return [step1, step2, step3, step4];
};
