import type { FinalParams, Job, JobStage } from '../core/types';
import { decodeFrames } from './decode';
import { demuxMp4, fetchMp4 } from './demux';
import type { EncodeInput, FrameRGBA } from './encoders';
import { fitSize, planFrames } from './transform';

export type RunResult = { bytes: Uint8Array; params: FinalParams };
export type OnProgress = (stage: JobStage, ratio: number) => void;

/**
 * 一次转换的完整流水线（在 Worker 中运行）：
 *   M1-2 取源 + 拆封装：fetch(job.source.mp4Url) → mp4box 取轨道信息、avcC 与样本（demux.ts）
 *   M1-3 解码 + 变换：VideoDecoder 逐帧解码（decode.ts）；按 preset.maxSide 缩放、按 preset.fpsCap 抽帧、
 *        timing.ts 计算帧延迟（transform.ts）；OffscreenCanvas 取 RGBA
 *   M1-4 编码：ENCODERS[preset.encoder].encode()
 *   M2-4 目标体积：超出 preset.targetBytes 时按 颜色→帧率→尺寸 降级重编码，最多 4 次
 *
 * signal 触发时应尽快抛出 AbortError。
 */
export const runJob = async (
  job: Job,
  signal: AbortSignal,
  onProgress: OnProgress,
): Promise<RunResult> => {
  onProgress('fetching', 0);
  const mp4 = await fetchMp4(job.source.mp4Url, signal);
  onProgress('fetching', 1);
  signal.throwIfAborted();
  const video = await demuxMp4(mp4);
  onProgress('decoding', 0);

  const { width, height } = fitSize(video.width, video.height, job.preset.maxSide);
  const plan = planFrames(
    video.samples.map((s) => s.timestampUs),
    video.durationUs,
    job.preset.fpsCap,
  );
  const canvas = new OffscreenCanvas(width, height);
  const maybeCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!maybeCtx) throw new Error('无法创建画布');
  // 另存为非空常量：生成器函数里拿不到外层的空值收窄
  const ctx: OffscreenCanvasRenderingContext2D = maybeCtx;
  ctx.imageSmoothingQuality = 'high';

  /** 每次调用从头解码一遍（编码器可两遍遍历）；内存里同时只有一帧 RGBA。共用一块画布，迭代器不可并发 */
  async function* frames(): AsyncGenerator<FrameRGBA> {
    for await (const frame of decodeFrames(video, signal, (ts) => plan.has(ts))) {
      const timestampUs = frame.timestamp;
      let data: Uint8ClampedArray;
      try {
        ctx.drawImage(frame, 0, 0, width, height);
        data = ctx.getImageData(0, 0, width, height).data;
      } finally {
        frame.close();
      }
      const delayCs = plan.get(timestampUs);
      if (delayCs === undefined) throw new Error(`解码出了计划外的帧：${timestampUs}µs`);
      yield { data, width, height, delayCs };
    }
  }

  const input: EncodeInput = { width, height, frameCount: plan.size, frames };

  // 编码尚未实现：先把帧跑一遍做核对，报错里带上结果，便于端到端确认解码与变换已跑通
  let count = 0;
  let totalCs = 0;
  for await (const f of input.frames()) {
    count++;
    totalCs += f.delayCs;
  }
  if (count !== input.frameCount) {
    throw new Error(`解码帧数不对：期望 ${input.frameCount}，实际 ${count}`);
  }
  throw new Error(
    `编码尚未实现（ROADMAP M1-4）；已解码 ${count} 帧（原 ${video.samples.length} 帧）、延迟总和 ${totalCs}cs、输出 ${width}×${height}`,
  );
};
