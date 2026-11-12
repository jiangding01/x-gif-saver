import { nearestColorIndex, type Palette } from 'gifenc';
import { describe, expect, it } from 'vitest';
import { BAYER_8, createPaletteLookup, ditherSpread, ditherToIndex } from './dither';

/** 生成一张纯色或按函数取色的 RGBA 图 */
const image = (w: number, h: number, color: (x: number, y: number) => [number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = color(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return data;
};

describe('BAYER_8 / ditherSpread', () => {
  it('Bayer 矩阵是 0–63 的一个排列', () => {
    expect([...BAYER_8].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
  });

  it('颜色越少抖动越强', () => {
    expect(ditherSpread(256)).toBeCloseTo(15.12, 2);
    expect(ditherSpread(64)).toBe(24);
    expect(ditherSpread(64)).toBeGreaterThan(ditherSpread(128));
  });
});

describe('createPaletteLookup', () => {
  const palette: Palette = [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
    [0, 128, 255],
    [4, 4, 4],
    [251, 251, 251],
  ];

  it('纯黑、纯白查到的就是纯黑、纯白（565 桶中心用位复制，不偏到相邻的近黑近白）', () => {
    const lookup = createPaletteLookup(palette);
    expect(lookup(0, 0, 0)).toBe(0);
    expect(lookup(255, 255, 255)).toBe(1);
  });

  it('桶中心按位复制还原：纯红桶中心是 (255,0,0)，查到纯红而不是相邻的暗红', () => {
    const lookup = createPaletteLookup([
      [255, 0, 0],
      [250, 0, 0],
      [0, 0, 0],
    ]);
    // 纯红的 565 桶是 r5=31 → 255；若按 <<3|4 还原成 252，会更接近 250
    expect(lookup(255, 0, 0)).toBe(0);
    expect(lookup(253, 2, 3)).toBe(0);
    expect(lookup(0, 3, 7)).toBe(2);
  });

  it('同一 565 桶内的颜色都映射到桶中心的最近色', () => {
    const lookup = createPaletteLookup(palette);
    const expand5 = (v: number) => (v << 3) | (v >> 2);
    const expand6 = (v: number) => (v << 2) | (v >> 4);
    for (let i = 0; i < 500; i++) {
      const [r, g, b] = [(i * 97) % 256, (i * 53) % 256, (i * 31) % 256];
      const center = [expand5(r >> 3), expand6(g >> 2), expand5(b >> 3)];
      expect(lookup(r, g, b)).toBe(nearestColorIndex(palette, center));
    }
  });
});

describe('ditherToIndex', () => {
  const blackWhite: Palette = [
    [0, 0, 0],
    [255, 255, 255],
  ];

  it('spread = 0 时等于逐像素查最近色（不抖动）', () => {
    const lookup = createPaletteLookup(blackWhite);
    const rgba = image(16, 16, (x, y) => [x * 16, y * 16, 100]);
    const out = ditherToIndex(rgba, 16, 16, lookup, 0);
    for (let p = 0; p < 256; p++) {
      expect(out[p]).toBe(
        lookup(rgba[p * 4] as number, rgba[p * 4 + 1] as number, rgba[p * 4 + 2] as number),
      );
    }
  });

  it('两色正中间的灰：每个 8×8 块里两色各占一半', () => {
    const lookup = createPaletteLookup(blackWhite);
    const out = ditherToIndex(
      image(16, 8, () => [128, 128, 128]),
      16,
      8,
      lookup,
      256,
    );
    const whites = [...out].filter((v) => v === 1).length;
    expect(whites).toBe(64);
  });

  it('同一输入两次输出完全相同（帧间稳定，静止区域不爬动）', () => {
    const palette: Palette = [
      [0, 0, 0],
      [128, 64, 32],
      [255, 255, 255],
    ];
    const rgba = image(24, 24, (x, y) => [(x * 11) % 256, (y * 7) % 256, (x * y) % 256]);
    const a = ditherToIndex(rgba, 24, 24, createPaletteLookup(palette), ditherSpread(3));
    const b = ditherToIndex(rgba, 24, 24, createPaletteLookup(palette), ditherSpread(3));
    expect(a).toEqual(b);
  });

  it('偏移不会越界：纯黑、纯白加最大抖动仍映射到自身', () => {
    const lookup = createPaletteLookup(blackWhite);
    expect([
      ...ditherToIndex(
        image(8, 8, () => [0, 0, 0]),
        8,
        8,
        lookup,
        40,
      ),
    ]).toEqual(new Array(64).fill(0));
    expect([
      ...ditherToIndex(
        image(8, 8, () => [255, 255, 255]),
        8,
        8,
        lookup,
        40,
      ),
    ]).toEqual(new Array(64).fill(1));
  });
});
