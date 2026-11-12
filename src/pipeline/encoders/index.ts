// 编码器注册表。新增编码器（gifski / WebP 等）：
//   1. 在 core/types.ts 的 EncoderId 加 ID
//   2. 新建 encoders/<id>.ts，导出一个 Encoder 对象
//   3. 加到下面的 ENCODERS
// 流水线只依赖 Encoder 接口，不关心具体实现。

import type { DitherMode, EncoderId } from '../../core/types';
import { gifencEncoder } from './gifenc';

export type FrameRGBA = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** 本帧延迟（厘秒），由 timing.ts 计算 */
  delayCs: number;
};

export type EncodeInput = {
  width: number;
  height: number;
  frameCount: number;
  /**
   * 帧序列工厂：每次调用都从头解码一遍。
   * 编码器可以先遍历一遍抽样生成全局调色板，再遍历一遍逐帧编码，避免把所有帧留在内存里。
   * 多次遍历必须串行：各次遍历共用一块画布，同时持有两个迭代器会互相覆盖。
   */
  frames: () => AsyncIterable<FrameRGBA>;
};

export type EncodeOptions = {
  colors: number;
  dither: DitherMode;
  signal: AbortSignal;
  /** 0–1 */
  onProgress: (ratio: number) => void;
};

export type EncodeResult = {
  bytes: Uint8Array;
  /** 实际使用的颜色数：量化会合并相近色，可能少于预设 */
  colors: number;
};

export type Encoder = {
  id: EncoderId;
  label: string;
  /** 输出的 MIME 与扩展名，为将来输出 WebP 等格式预留 */
  mime: 'image/gif';
  ext: 'gif';
  encode: (input: EncodeInput, opts: EncodeOptions) => Promise<EncodeResult>;
};

export const ENCODERS: Record<EncoderId, Encoder> = {
  gifenc: gifencEncoder,
};
