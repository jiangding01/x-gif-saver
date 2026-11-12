import { storage } from '#imports';
import type { Preset, Settings } from './types';

// 默认值的取舍见 docs/TECH-DESIGN.md「预设」。一期只读这里的默认值，二期由设置页写入。

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'original',
    name: '原画',
    builtin: true,
    maxSide: null,
    fpsCap: null,
    colors: 256,
    dither: 'bayer',
    encoder: 'gifenc',
    targetBytes: null,
  },
  {
    id: 'balanced',
    name: '均衡',
    builtin: true,
    maxSide: 480,
    fpsCap: null,
    colors: 256,
    dither: 'bayer',
    encoder: 'gifenc',
    targetBytes: null,
  },
  {
    id: 'sticker',
    name: '表情包',
    builtin: true,
    maxSide: 320,
    fpsCap: 12,
    colors: 128,
    dither: 'bayer',
    encoder: 'gifenc',
    targetBytes: 1024 * 1024,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  defaultPresetId: 'balanced',
  presets: BUILTIN_PRESETS,
  // 推文 ID 按时间递增，放在开头时文件夹按名称排序即按发帖时间排序
  filenameTemplate: '{tweetId}_{author}',
  subfolder: 'X-GIF',
};

/**
 * 设置存储项。改 Settings 结构时：version +1，并在 migrations 里写 旧结构 → 新结构 的转换，
 * 不要直接改字段含义，否则老用户的配置会读坏。
 */
export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 1,
});

export const resolvePreset = (settings: Settings, presetId?: string): Preset => {
  const wanted = presetId ?? settings.defaultPresetId;
  return (
    settings.presets.find((p) => p.id === wanted) ??
    settings.presets.find((p) => p.id === settings.defaultPresetId) ??
    (BUILTIN_PRESETS[1] as Preset)
  );
};
