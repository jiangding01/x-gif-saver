// 转换失败的原因用「错误码 + 细节」在各上下文之间传递，到页面上再翻译成当前语言。
// Worker 和 offscreen 文档里用不了 chrome.i18n，所以不能在出错的地方直接生成文案；
// 本文件不依赖 i18n（Worker 也会引用），翻译在 ui/errorText.ts。

export const JOB_ERROR_CODES = [
  'fetchFailed',
  'noH264',
  'unsupportedCodec',
  'invalidVideo',
  'parseFailed',
  'decodeFailed',
  'internal',
  'workerCrashed',
  'cancelled',
  'startFailed',
  'saveFailed',
  'extensionUpdated',
  'timeout',
  'unknown',
] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

/** detail 是不翻译的技术细节（HTTP 状态码、编码名、底层报错），显示在原因后面 */
export type JobError = { code: JobErrorCode; detail?: string };

const isCode = (v: unknown): v is JobErrorCode =>
  typeof v === 'string' && (JOB_ERROR_CODES as readonly string[]).includes(v);

/** 带错误码的 Error：流水线里 throw 它，Worker 捕获后用 toJobError 取出码和细节 */
export const jobError = (code: JobErrorCode, detail?: string): Error =>
  Object.assign(new Error(detail ? `${code}: ${detail}` : code), {
    code,
    ...(detail ? { detail } : {}),
  });

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** 任意异常 → JobError；不是 jobError 抛出的（程序缺陷、浏览器异常）归为 internal，原始信息放进细节 */
export const toJobError = (err: unknown): JobError => {
  const e = err as { code?: unknown; detail?: unknown };
  if (typeof err === 'object' && err !== null && isCode(e.code)) {
    return typeof e.detail === 'string' ? { code: e.code, detail: e.detail } : { code: e.code };
  }
  return { code: 'internal', detail: messageOf(err) };
};

/** 把底层异常包成带码的 Error，细节取原始信息 */
export const wrapError = (code: JobErrorCode, err: unknown): Error =>
  jobError(code, messageOf(err));

/** 直接生成要发送的 JobError（不需要 throw 的地方，例如 background 下载失败） */
export const errorOf = (code: JobErrorCode, err: unknown): JobError => ({
  code,
  detail: messageOf(err),
});
