import type { FinalParams, Job, JobStage } from '../core/types';

export type RunResult = { bytes: Uint8Array; params: FinalParams };
export type OnProgress = (stage: JobStage, ratio: number) => void;

/**
 * 一次转换的完整流水线（在 Worker 中运行）：
 *   M1-2 取源：fetch(job.source.mp4Url) → ArrayBuffer（offscreen 有 host_permissions，不受 CORS 限制）
 *   M1-3 拆封装 + 解码：mp4box.js 取 avcC/样本 → VideoDecoder 逐帧解码（VideoDecoder.isConfigSupported 失败直接报错）
 *   M1-3 变换：OffscreenCanvas 按 preset.maxSide 等比缩放、按 preset.fpsCap 抽帧；timing.ts 计算帧延迟
 *   M1-4 编码：ENCODERS[preset.encoder].encode()
 *   M2-4 目标体积：超出 preset.targetBytes 时按 颜色→帧率→尺寸 降级重编码，最多 4 次
 *
 * signal 触发时应尽快抛出 AbortError。
 */
export const runJob = async (
  _job: Job,
  _signal: AbortSignal,
  _onProgress: OnProgress,
): Promise<RunResult> => {
  throw new Error('转换流水线尚未实现（ROADMAP M1-2 ~ M1-4）');
};
