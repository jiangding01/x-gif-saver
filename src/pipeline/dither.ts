// 有序抖动（ROADMAP M1-4，TECH-DESIGN §5.3）：把 RGBA 映射到全局调色板下标。纯函数，Node 可测。
//
// 用 Bayer 8×8 有序抖动而不是误差扩散：偏移只取决于像素坐标，同一位置帧间偏移固定，
// 静止区域不会出现噪点「爬动」，LZW 压缩率也更好。

import { nearestColorIndex, type Palette } from 'gifenc';

/** 标准 8×8 Bayer 矩阵（0–63），行优先 */
export const BAYER_8: readonly number[] = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

/**
 * 抖动强度（偏移的峰峰值）。调色板是按画面自适应量化的，密集区相邻色距远小于均匀色立方的步长
 * 256/cbrt(colors)，按那个值抖会让平坦色块起噪点，所以取更小的基数：256 色 ≈ 15，64 色 = 24
 */
export const ditherSpread = (colors: number): number => 96 / Math.cbrt(colors);

/** 5/6 位分量还原为 8 位：位复制，保证 0 → 0、满值 → 255（纯黑纯白不偏色） */
const expand5 = (v: number) => (v << 3) | (v >> 2);
const expand6 = (v: number) => (v << 2) | (v >> 4);

/**
 * 调色板查找：以 rgb565 为键的 65536 项缓存，惰性填充（只为实际出现的颜色桶查最近色）。
 * 同一桶内的颜色都映射到「桶中心的最近色」。
 */
export const createPaletteLookup = (
  palette: Palette,
): ((r: number, g: number, b: number) => number) => {
  const cache = new Int16Array(65536).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    let index = cache[key] as number;
    if (index < 0) {
      index = nearestColorIndex(palette, [
        expand5(key >> 11),
        expand6((key >> 5) & 63),
        expand5(key & 31),
      ]);
      cache[key] = index;
    }
    return index;
  };
};

const clamp = (v: number) => Math.min(255, Math.max(0, v));

/**
 * RGBA → 调色板下标。spread = 0 时不抖动，等价于逐像素查最近色。alpha 忽略（X 的 GIF 视频不透明）
 */
export const ditherToIndex = (
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  lookup: (r: number, g: number, b: number) => number,
  spread: number,
): Uint8Array => {
  const out = new Uint8Array(width * height);
  // 预先算好 64 个偏移，内层循环只做加法和查表
  const offsets = BAYER_8.map((v) => (v / 64 - 0.5) * spread);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const row = (y & 7) << 3;
    for (let x = 0; x < width; x++, p++) {
      const o = offsets[row | (x & 7)] as number;
      const i = p << 2;
      out[p] = lookup(
        clamp(Math.round((rgba[i] as number) + o)),
        clamp(Math.round((rgba[i + 1] as number) + o)),
        clamp(Math.round((rgba[i + 2] as number) + o)),
      );
    }
  }
  return out;
};
