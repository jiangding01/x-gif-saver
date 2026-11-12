// 把转换失败的错误码翻译成当前语言（content script 里调用，那里有 chrome.i18n）。

import { i18n } from '#i18n';
import type { JobError, JobErrorCode } from '../core/errors';

const REASONS: Record<JobErrorCode, () => string> = {
  fetchFailed: () => i18n.t('error.fetchFailed'),
  noH264: () => i18n.t('error.noH264'),
  unsupportedCodec: () => i18n.t('error.unsupportedCodec'),
  invalidVideo: () => i18n.t('error.invalidVideo'),
  parseFailed: () => i18n.t('error.parseFailed'),
  decodeFailed: () => i18n.t('error.decodeFailed'),
  internal: () => i18n.t('error.internal'),
  workerCrashed: () => i18n.t('error.workerCrashed'),
  cancelled: () => i18n.t('error.cancelled'),
  startFailed: () => i18n.t('error.startFailed'),
  saveFailed: () => i18n.t('error.saveFailed'),
  extensionUpdated: () => i18n.t('error.extensionUpdated'),
  timeout: () => i18n.t('error.timeout'),
  unknown: () => i18n.t('error.unknown'),
};

/** 翻译成当前语言，例如「下载 GIF 视频失败：HTTP 404」；只能在有 chrome.i18n 的上下文里调用 */
export const describeError = (e: JobError): string => {
  // 版本不一致等情况下可能收到不认识的码，按未知错误显示，不让整个状态更新抛错
  const reason = (REASONS[e.code] ?? REASONS.unknown)();
  return e.detail ? i18n.t('error.withDetail', [reason, e.detail]) : reason;
};
