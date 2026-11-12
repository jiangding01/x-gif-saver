import { describe, expect, it } from 'vitest';
import { gifencEncoder, sampleIndices } from './gifenc';
import type { EncodeInput, FrameRGBA } from './index';

type ParsedGif = {
  width: number;
  height: number;
  globalColors: number[][];
  loop: number | null;
  frames: { delayCs: number; dispose: number; transparentIndex: number | null; pixels: number[] }[];
};

/** GIF 的 LZW 解码：把一帧的数据子块还原成调色板下标 */
const lzwDecode = (minCodeSize: number, data: number[], pixelCount: number): number[] => {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let size = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = Array.from({ length: clear + 2 }, (_, i) => [i]);
    size = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let prev: number[] | null = null;
  let bit = 0;
  while (out.length < pixelCount) {
    let code = 0;
    for (let i = 0; i < size; i++, bit++) {
      code |= (((data[bit >> 3] as number) >> (bit & 7)) & 1) << i;
    }
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === end) break;
    const entry: number[] =
      code < dict.length
        ? (dict[code] as number[])
        : [...(prev as number[]), (prev as number[])[0] as number];
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0] as number]);
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }
  return out;
};

/** 最小 GIF 解析器：只读本项目会写出的结构（全局调色板、NETSCAPE 循环、GCE 延迟、无局部调色板） */
const parseGif = (bytes: Uint8Array): ParsedGif => {
  const b = [...bytes];
  const u16 = (i: number) => (b[i] as number) | ((b[i + 1] as number) << 8);
  expect(String.fromCharCode(...b.slice(0, 6))).toBe('GIF89a');
  const width = u16(6);
  const height = u16(8);
  const packed = b[10] as number;
  expect(packed & 0x80).toBe(0x80);
  const tableSize = 1 << ((packed & 7) + 1);
  const globalColors = Array.from({ length: tableSize }, (_, i) => b.slice(13 + i * 3, 16 + i * 3));
  let p = 13 + tableSize * 3;
  let loop: number | null = null;
  let delayCs = 0;
  let dispose = 0;
  let transparentIndex: number | null = null;
  const frames: ParsedGif['frames'] = [];
  const readSubBlocks = () => {
    const data: number[] = [];
    while (b[p] !== 0) {
      const len = b[p] as number;
      data.push(...b.slice(p + 1, p + 1 + len));
      p += len + 1;
    }
    p++;
    return data;
  };
  while (b[p] !== 0x3b) {
    if (b[p] === 0x21 && b[p + 1] === 0xff) {
      p += 2;
      const appId = String.fromCharCode(...b.slice(p + 1, p + 12));
      p += 12;
      const data = readSubBlocks();
      if (appId === 'NETSCAPE2.0') loop = (data[1] as number) | ((data[2] as number) << 8);
    } else if (b[p] === 0x21 && b[p + 1] === 0xf9) {
      const packedGce = b[p + 3] as number;
      dispose = (packedGce >> 2) & 7;
      transparentIndex = packedGce & 1 ? (b[p + 6] as number) : null;
      delayCs = u16(p + 4);
      p += 8;
    } else if (b[p] === 0x2c) {
      const w = u16(p + 5);
      const h = u16(p + 7);
      expect((b[p + 9] as number) & 0x80).toBe(0); // 没有局部调色板
      const minCodeSize = b[p + 10] as number;
      p += 11;
      const pixels = lzwDecode(minCodeSize, readSubBlocks(), w * h);
      frames.push({ delayCs, dispose, transparentIndex, pixels });
    } else {
      throw new Error(`未知块 0x${(b[p] as number).toString(16)}`);
    }
  }
  return { width, height, globalColors, loop, frames };
};

const W = 16;
const H = 12;
/** 四种差异很大的纯色块，调色板能精确表示，抖动偏移也不会让它们跳到别的颜色 */
const COLORS: [number, number, number][] = [
  [255, 0, 0],
  [0, 200, 0],
  [0, 0, 255],
  [255, 255, 255],
];
/** 按 GIF 规则把各帧叠加成每帧实际显示的颜色：透明像素保留上一帧（dispose = 1） */
const composite = (gif: ParsedGif): number[][][] => {
  let canvas: number[] = [];
  return gif.frames.map((frame) => {
    canvas = frame.pixels.map((index, p) =>
      index === frame.transparentIndex ? (canvas[p] as number) : index,
    );
    return canvas.map((index) => gif.globalColors[index] as number[]);
  });
};

/**
 * 第 f 帧的四个色块。rotate：四块按帧号轮换，每个像素都变；
 * one：只有左上一块按帧号换色，其余三块静止（帧间差分应把它们写成透明）
 */
const frameData = (f: number, mode: 'rotate' | 'one' = 'rotate') => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const pos = (x < W / 2 ? 0 : 1) + (y < H / 2 ? 0 : 2);
      const block = mode === 'rotate' ? (pos + f) % 4 : pos === 0 ? (f % 2 === 0 ? 0 : 3) : pos;
      data.set([...(COLORS[block] as number[]), 255], (y * W + x) * 4);
    }
  }
  return data;
};

const inputOf = (delays: number[], mode: 'rotate' | 'one' = 'rotate'): EncodeInput => ({
  width: W,
  height: H,
  frameCount: delays.length,
  frames: async function* (): AsyncGenerator<FrameRGBA> {
    for (const [f, delayCs] of delays.entries()) {
      yield { data: frameData(f, mode), width: W, height: H, delayCs };
    }
  },
});

const options = (dither: 'bayer' | 'none', signal = new AbortController().signal) => ({
  colors: 256,
  dither,
  signal,
  onProgress: () => {},
});

describe('gifencEncoder', () => {
  for (const dither of ['bayer', 'none'] as const) {
    for (const mode of ['rotate', 'one'] as const) {
      it(`编码后能还原（dither=${dither}，${mode === 'rotate' ? '全部像素变化' : '只有一块变化'}）：尺寸、无限循环、帧数、延迟、叠加后的逐像素颜色都与输入一致`, async () => {
        const delays = [7, 6, 7, 2];
        const { bytes, colors } = await gifencEncoder.encode(
          inputOf(delays, mode),
          options(dither),
        );
        const gif = parseGif(bytes);
        expect(gif.width).toBe(W);
        expect(gif.height).toBe(H);
        expect(gif.loop).toBe(0);
        expect(gif.frames.map((f) => f.delayCs)).toEqual(delays);
        expect(gif.frames.every((f) => f.dispose === 1)).toBe(true);
        // 留一格给透明色，可见颜色最多 255
        expect(colors).toBeLessThanOrEqual(255);
        expect(colors).toBeGreaterThanOrEqual(COLORS.length);
        for (const [f, shown] of composite(gif).entries()) {
          const expected = frameData(f, mode);
          shown.forEach((rgb, p) => {
            expect(rgb).toEqual([...expected.slice(p * 4, p * 4 + 3)]);
          });
        }
      });
    }
  }

  it('调色板塞满 255 色时，透明下标（255）不与任何真实颜色冲突，叠加后无错色', async () => {
    const GW = 64;
    const GH = 32;
    // 64×32 = 2048 种互不相同的颜色，量化后一定用满 255 色；第二帧只改左半边
    const gradient = (f: number) => {
      const data = new Uint8ClampedArray(GW * GH * 4);
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const shift = f === 1 && x < GW / 2 ? 128 : 0;
          data.set([(x * 4 + shift) % 256, y * 8, (x * y) % 256, 255], (y * GW + x) * 4);
        }
      }
      return data;
    };
    const input: EncodeInput = {
      width: GW,
      height: GH,
      frameCount: 2,
      frames: async function* () {
        for (const f of [0, 1]) yield { data: gradient(f), width: GW, height: GH, delayCs: 10 };
      },
    };
    const { bytes, colors } = await gifencEncoder.encode(input, options('none'));
    expect(colors).toBe(255);
    const gif = parseGif(bytes);
    expect(gif.globalColors).toHaveLength(256);
    const [first, second] = gif.frames;
    expect(second?.transparentIndex).toBe(255);
    // 首帧不含透明下标；第二帧的真实像素也不会用到 255
    expect(first?.pixels.includes(255)).toBe(false);
    const shown = composite(gif);
    // 叠加后第二帧右半边（未变化）与第一帧完全相同
    for (let y = 0; y < GH; y++) {
      for (let x = GW / 2; x < GW; x++) {
        expect(shown[1]?.[y * GW + x]).toEqual(shown[0]?.[y * GW + x]);
      }
    }
  });

  it('帧间差分：静止区域写成透明色，首帧完整、不透明', async () => {
    const { bytes } = await gifencEncoder.encode(inputOf([5, 5, 5, 5], 'one'), options('bayer'));
    const gif = parseGif(bytes);
    const [first, ...rest] = gif.frames;
    expect(first?.transparentIndex).toBeNull();
    for (const frame of rest) {
      const transparent = frame.pixels.filter((i) => i === frame.transparentIndex).length;
      // 四块里三块静止 → 至少 3/4 像素透明
      expect(transparent).toBeGreaterThanOrEqual((W * H * 3) / 4);
    }
  });

  it('进度从 0 走到 1 且单调不减', async () => {
    const ratios: number[] = [];
    await gifencEncoder.encode(inputOf([5, 5, 5]), {
      ...options('bayer'),
      onProgress: (r) => ratios.push(r),
    });
    expect(ratios.at(-1)).toBe(1);
    expect(ratios.every((r, i) => i === 0 || r >= (ratios[i - 1] as number))).toBe(true);
  });

  it('已取消时抛 AbortError', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      gifencEncoder.encode(inputOf([5, 5]), options('bayer', abort.signal)),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('frames() 产出的帧数与 frameCount 不符时报错', async () => {
    const input = { ...inputOf([5, 5]), frameCount: 3 };
    await expect(gifencEncoder.encode(input, options('bayer'))).rejects.toThrow('帧数不对');
  });
});

describe('sampleIndices', () => {
  it('帧数不超过 10 时全取；只有 1 帧时取第 0 帧（不除零）', () => {
    expect([...sampleIndices(0)]).toEqual([]);
    expect([...sampleIndices(1)]).toEqual([0]);
    expect([...sampleIndices(5)]).toEqual([0, 1, 2, 3, 4]);
  });

  it('帧数多时均匀抽 10 帧，包含首尾', () => {
    const picked = [...sampleIndices(179)];
    expect(picked).toHaveLength(10);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(178);
  });
});
