// gifenc 编码器（ROADMAP M1-4，TECH-DESIGN §5.2/§5.3）：两遍遍历。
//   第一遍：均匀抽样 ≤ 10 帧拼起来量化，得到全局调色板（减少帧间闪烁，体积更小）
//   第二遍：逐帧有序抖动映射到调色板，再做帧间差分 + writeFrame
// gifenc 自带的 applyPalette 不抖动、每帧重建缓存，所以「不抖动」模式也走同一张查找表（spread = 0）。
//
// 帧间差分：与当前画面相同的像素写成透明色，dispose = 1 叠加在上一帧上。成片透明像素 LZW 后几乎不占空间，
// 实测 179 帧 480×480 从 15.7MB 降到约 1/7（ffmpeg 默认也这样做）。有序抖动让静止区域每帧下标完全相同，
// 差分才有效。gifenc 不支持写局部矩形（帧位置固定为 0,0），所以只做透明不做裁剪。

import { GIFEncoder, quantize } from 'gifenc';
import { createPaletteLookup, ditherSpread, ditherToIndex } from '../dither';
import type { Encoder, FrameRGBA } from './index';

/** 生成全局调色板时最多抽样的帧数 */
const SAMPLE_FRAMES = 10;
/** 第一遍（只解码 + 抽样）占总进度的比例；第二遍还要抖动和 LZW 压缩，更慢 */
const FIRST_PASS_SHARE = 0.4;

/** 均匀抽样的帧序号；n ≤ k 时全取 */
export const sampleIndices = (frameCount: number, k: number = SAMPLE_FRAMES): Set<number> => {
  if (frameCount <= 0) return new Set();
  const count = Math.min(k, frameCount);
  if (count === 1) return new Set([0]);
  return new Set(
    Array.from({ length: count }, (_, i) => Math.round((i * (frameCount - 1)) / (count - 1))),
  );
};

/** GIF dispose 方式 1：保留本帧，下一帧叠加在其上（帧间差分依赖它） */
const DISPOSE_KEEP = 1;

/**
 * 帧间差分：与当前画面（shown）相同的像素写成 transparentIndex，不同的写真实下标并更新 shown。
 * shown 会被原地修改，表示叠加本帧后的画面。
 */
export const diffFrame = (
  shown: Uint8Array,
  index: Uint8Array,
  transparentIndex: number,
): Uint8Array => {
  const out = new Uint8Array(index.length);
  for (let p = 0; p < index.length; p++) {
    const v = index[p] as number;
    if (v === shown[p]) {
      out[p] = transparentIndex;
    } else {
      out[p] = v;
      shown[p] = v;
    }
  }
  return out;
};

/** 预估输出体积作为初始缓冲，避免大文件反复扩容（gifenc 默认 4KB，超过 1MB 后每次只扩 12.5%） */
const initialCapacity = (width: number, height: number, frames: number) =>
  Math.min(64 * 1024 * 1024, Math.max(64 * 1024, Math.round((width * height * frames) / 4)));

export const gifencEncoder: Encoder = {
  id: 'gifenc',
  label: '标准（gifenc + 有序抖动）',
  mime: 'image/gif',
  ext: 'gif',
  encode: async (input, { colors, dither, signal, onProgress }) => {
    const { width, height, frameCount } = input;
    if (frameCount <= 0) throw new Error('没有可编码的帧');

    // 第一遍：只保留被抽中的帧（getImageData 返回独占 buffer，quantize 需要），其余用完即弃
    const wanted = sampleIndices(frameCount);
    const sampled: FrameRGBA['data'][] = [];
    let i = 0;
    for await (const frame of input.frames()) {
      signal.throwIfAborted();
      if (wanted.has(i)) sampled.push(frame.data);
      i++;
      onProgress((i / frameCount) * FIRST_PASS_SHARE);
    }
    if (i !== frameCount) throw new Error(`解码帧数不对：期望 ${frameCount}，实际 ${i}`);

    const pixels = width * height * 4;
    const joined = new Uint8ClampedArray(pixels * sampled.length);
    sampled.forEach((data, n) => {
      joined.set(data, n * pixels);
    });
    // 留一格给透明色：量化到 colors - 1 色，透明色接在末尾（颜色值无所谓，不会被显示）
    const visible = quantize(joined, colors - 1, { format: 'rgb565' });
    const lookup = createPaletteLookup(visible);
    const transparentIndex = visible.length;
    const palette = [...visible, [0, 0, 0]];
    const spread = dither === 'bayer' ? ditherSpread(colors) : 0;

    // 第二遍：逐帧抖动 + 写入
    const gif = GIFEncoder({ initialCapacity: initialCapacity(width, height, frameCount) });
    let written = 0;
    let shown: Uint8Array | null = null;
    for await (const frame of input.frames()) {
      signal.throwIfAborted();
      const index = ditherToIndex(frame.data, width, height, lookup, spread);
      const first: boolean = shown === null;
      const pixels: Uint8Array = shown ? diffFrame(shown, index, transparentIndex) : index;
      shown ??= index;
      gif.writeFrame(pixels, width, height, {
        // 首帧写入全局调色板与无限循环、完整画面；之后的帧沿用全局调色板，只写变化的像素
        ...(first ? { palette, repeat: 0 } : { transparent: true, transparentIndex }),
        dispose: DISPOSE_KEEP,
        // gifenc 的 delay 单位是毫秒，内部 Math.round(delay / 10) 转回厘秒，这里传整十毫秒精确无误差
        delay: frame.delayCs * 10,
      });
      written++;
      onProgress(Math.min(1, FIRST_PASS_SHARE + (written / frameCount) * (1 - FIRST_PASS_SHARE)));
    }
    if (written !== frameCount) {
      throw new Error(`编码帧数不对：期望 ${frameCount}，实际 ${written}`);
    }
    gif.finish();
    // 显式发终值：上面的浮点运算未必恰好等于 1，调用方的节流要靠它收尾
    onProgress(1);
    // bytes() 本身就是拷贝，可直接 transfer 给 offscreen
    return { bytes: gif.bytes(), colors: visible.length };
  },
};
