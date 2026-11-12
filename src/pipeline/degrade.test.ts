import { describe, expect, it } from 'vitest';
import { degradeSteps, MIN_SIDE } from './degrade';

describe('degradeSteps', () => {
  it('按 颜色 → 帧率 → 尺寸 → 尺寸与颜色 逐级累加', () => {
    expect(degradeSteps({ maxSide: 480, fpsCap: null, colors: 256 }, 480)).toEqual([
      { maxSide: 480, fpsCap: null, colors: 128 },
      { maxSide: 480, fpsCap: 10, colors: 128 },
      { maxSide: 360, fpsCap: 10, colors: 128 },
      { maxSide: 270, fpsCap: 10, colors: 64 },
    ]);
  });

  it('不会把参数调高：颜色已低于 128、帧率已低于 10 时保持', () => {
    const [s1, s2] = degradeSteps({ maxSide: 320, fpsCap: 8, colors: 64 }, 320);
    expect(s1).toEqual({ maxSide: 320, fpsCap: 8, colors: 64 });
    expect(s2).toEqual({ maxSide: 320, fpsCap: 8, colors: 64 });
  });

  it('按实际最长边缩小（原视频比 maxSide 小时不按 maxSide 算）', () => {
    const steps = degradeSteps({ maxSide: null, fpsCap: null, colors: 256 }, 300);
    expect(steps[2]?.maxSide).toBe(225);
    expect(steps[3]?.maxSide).toBe(169);
  });

  it('最长边不低于下限', () => {
    const steps = degradeSteps({ maxSide: 70, fpsCap: null, colors: 128 }, 70);
    expect(steps[2]?.maxSide).toBe(MIN_SIDE);
    expect(steps[3]?.maxSide).toBe(MIN_SIDE);
  });
});
