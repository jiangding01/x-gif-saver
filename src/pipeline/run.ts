import type { FinalParams, Job, JobStage } from '../core/types';
import { demuxMp4, fetchMp4 } from './demux';

export type RunResult = { bytes: Uint8Array; params: FinalParams };
export type OnProgress = (stage: JobStage, ratio: number) => void;

/**
 * 一次转换的完整流水线（在 Worker 中运行）：
 *   M1-2 取源 + 拆封装：fetch(job.source.mp4Url) → mp4box 取轨道信息、avcC 与样本（demux.ts）
 *   M1-3 解码：VideoDecoder 逐帧解码（VideoDecoder.isConfigSupported 失败直接报错）
 *   M1-3 变换：OffscreenCanvas 按 preset.maxSide 等比缩放、按 preset.fpsCap 抽帧；timing.ts 计算帧延迟
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

  // 解码、编码尚未实现：报错里带上解析结果，便于端到端确认取源与拆封装在 Worker 里已跑通
  const seconds = (video.durationUs / 1_000_000).toFixed(2);
  throw new Error(
    `解码尚未实现（ROADMAP M1-3）；已解析 ${video.width}×${video.height}、${video.samples.length} 帧、${seconds}s`,
  );
};
