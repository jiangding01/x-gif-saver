import type { FinalParams, Job, JobStage } from '../core/types';
import { decodeFrames } from './decode';
import { degradeSteps, type EncodeParams } from './degrade';
import { demuxMp4, fetchMp4 } from './demux';
import { ENCODERS, type EncodeInput, type FrameRGBA } from './encoders';
import { fitSize, planFrames } from './transform';

export type RunResult = { bytes: Uint8Array; params: FinalParams };
export type OnProgress = (stage: JobStage, ratio: number) => void;

/**
 * 一次转换的完整流水线（在 Worker 中运行）：
 *   M1-2 取源 + 拆封装：fetch(job.source.mp4Url) → mp4box 取轨道信息、avcC 与样本（demux.ts）
 *   M1-3 解码 + 变换：VideoDecoder 逐帧解码（decode.ts）；按 preset.maxSide 缩放、按 preset.fpsCap 抽帧、
 *        timing.ts 计算帧延迟（transform.ts）；OffscreenCanvas 取 RGBA
 *   M1-4 编码：ENCODERS[preset.encoder].encode()
 *   M2-4 目标体积：超出 preset.targetBytes 时按 degrade.ts 的四级参数降级重编码（只拆封装一次），
 *        保存最小的一次；结果里带上限、是否达标、是否降级过
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

  const encoder = ENCODERS[job.preset.encoder];
  const timestamps = video.samples.map((s) => s.timestampUs);

  /** 按一组参数算出输出尺寸与抽帧计划；key 相同的两组参数编码结果相同 */
  const prepare = (p: EncodeParams) => {
    const size = fitSize(video.width, video.height, p.maxSide);
    const plan = planFrames(timestamps, video.durationUs, p.fpsCap);
    return {
      ...size,
      plan,
      colors: p.colors,
      key: `${size.width}x${size.height}:${plan.size}:${p.colors}`,
    };
  };

  /** 解码 + 编码一遍。每次从头解码，内存里同时只有一帧 RGBA */
  const encodeOnce = async (
    { width, height, plan, colors: wantColors }: ReturnType<typeof prepare>,
    report: (ratio: number) => void,
  ): Promise<RunResult> => {
    const canvas = new OffscreenCanvas(width, height);
    const maybeCtx = canvas.getContext('2d', { willReadFrequently: true });
    if (!maybeCtx) throw new Error('无法创建画布');
    // 另存为非空常量：生成器函数里拿不到外层的空值收窄
    const ctx: OffscreenCanvasRenderingContext2D = maybeCtx;
    ctx.imageSmoothingQuality = 'high';

    /** 每次调用从头解码一遍（编码器可两遍遍历）。共用一块画布，迭代器不可并发 */
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
    const { bytes, colors } = await encoder.encode(input, {
      colors: wantColors,
      dither: job.preset.dither,
      signal,
      onProgress: report,
    });

    // 帧率按 GIF 实际播放时长（各帧延迟之和）算，抽帧后与原视频帧率不同
    let totalCs = 0;
    for (const cs of plan.values()) totalCs += cs;
    const fps = totalCs > 0 ? Math.round((plan.size * 1000) / totalCs) / 10 : 0;
    return {
      bytes,
      params: { width, height, fps, colors, frameCount: plan.size, bytes: bytes.length },
    };
  };

  // 进度节流：每帧都发会让消息穿过 Worker → offscreen → background → 标签页，前进 1% 以上或完成时才发
  const reporter = (stage: JobStage, map: (ratio: number) => number = (r) => r) => {
    let reported = -1;
    return (ratio: number) => {
      const r = map(ratio);
      if (r < 1 && r - reported < 0.01) return;
      reported = r;
      onProgress(stage, r);
    };
  };

  const start: EncodeParams = {
    maxSide: job.preset.maxSide,
    fpsCap: job.preset.fpsCap,
    colors: job.preset.colors,
  };
  const first = prepare(start);
  const firstResult = await encodeOnce(first, reporter('encoding'));
  const limit = job.preset.targetBytes;
  if (limit === null) return firstResult;
  if (firstResult.bytes.length <= limit) {
    return withTarget(firstResult, { limit, met: true, degraded: false });
  }

  // 超出目标体积：逐级降级重编码。效果与已试过的参数相同的级别跳过，不白跑一遍
  const tried = new Set([first.key]);
  const steps: ReturnType<typeof prepare>[] = [];
  for (const params of degradeSteps(start, Math.max(first.width, first.height))) {
    const step = prepare(params);
    if (tried.has(step.key)) continue;
    tried.add(step.key);
    steps.push(step);
  }
  let best = firstResult;
  for (const [i, step] of steps.entries()) {
    signal.throwIfAborted();
    const result = await encodeOnce(
      step,
      reporter('shrinking', (r) => (i + r) / steps.length),
    );
    // 保存最小的一次：降级后通常更小，但不保证（例如颜色变少后帧间差分变差）
    if (result.bytes.length < best.bytes.length) best = result;
    if (result.bytes.length <= limit) break;
  }
  return withTarget(best, {
    limit,
    met: best.bytes.length <= limit,
    degraded: best !== firstResult,
  });
};

const withTarget = (result: RunResult, target: NonNullable<FinalParams['target']>): RunResult => ({
  ...result,
  params: { ...result.params, target },
});
