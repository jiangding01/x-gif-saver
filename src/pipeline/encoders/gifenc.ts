import type { Encoder } from './index';

// M1-4 实现：gifenc 的 quantize 生成全局调色板（抽样帧）+ 自实现 Bayer 有序抖动替代 applyPalette + writeFrame。
// gifenc 本身不支持抖动（见其 README），抖动矩阵在 ../dither.ts 实现。
export const gifencEncoder: Encoder = {
  id: 'gifenc',
  label: '标准（gifenc + 有序抖动）',
  mime: 'image/gif',
  ext: 'gif',
  encode: async () => {
    throw new Error('gifenc 编码器尚未实现（ROADMAP M1-4）');
  },
};
