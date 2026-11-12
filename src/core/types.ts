// 全项目共享的领域类型。改这里的结构 = 改设置 schema，记得同步 settings.ts 的 version/migrations。

/** 编码器 ID。新增编码器：在这里加 ID，并在 src/pipeline/encoders/index.ts 注册 */
export type EncoderId = 'gifenc';

export type DitherMode = 'bayer' | 'none';

/** 一套转换参数（C1–C5） */
export type Preset = {
  id: string;
  name: string;
  /** 内置预设不可删除，但参数可改 */
  builtin: boolean;
  /** 最长边上限（px），null = 保持原尺寸 */
  maxSide: number | null;
  /** 帧率上限，null = 原帧率 */
  fpsCap: number | null;
  colors: 256 | 128 | 64;
  dither: DitherMode;
  encoder: EncoderId;
  /** 目标体积上限（字节），null = 不限；超限时自动降级，见 TECH-DESIGN「目标体积降级」 */
  targetBytes: number | null;
};

export type Settings = {
  defaultPresetId: string;
  presets: Preset[];
  /** 可用变量：{tweetId} {author} {date}（下载当天）；同一推文多个 GIF 时自动追加 _1、_2 */
  filenameTemplate: string;
  /** 相对 Chrome 默认下载目录的文件夹，可多层（/ 分隔）、可用与模板相同的变量；空串 = 直接放在下载目录 */
  subfolder: string;
};

/** 在页面上识别出的一个可下载 GIF */
export type GifSource = {
  mp4Url: string;
  /** X 的媒体 ID，如 HWz0LgxbUAEtAWN */
  mediaId: string;
  author: string;
  tweetId: string;
};

/** 一次转换任务 */
export type Job = {
  id: string;
  source: GifSource;
  preset: Preset;
  /** 已渲染好的相对下载路径（不含扩展名冲突处理） */
  filename: string;
};

/** shrinking：超出目标体积后的降级重编码（M2-4） */
export type JobStage = 'queued' | 'fetching' | 'decoding' | 'encoding' | 'shrinking' | 'saving';

/** 实际落盘时使用的参数（目标体积降级后可能与预设不同） */
export type FinalParams = {
  width: number;
  height: number;
  fps: number;
  colors: number;
  frameCount: number;
  bytes: number;
  /** 预设设了目标体积时：上限、最终是否达标、是否降级过（M2-4） */
  target?: { limit: number; met: boolean; degraded: boolean };
};
