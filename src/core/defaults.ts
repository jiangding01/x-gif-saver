// 默认设置与内置预设。纯数据、不依赖 WXT，便于单测和设置页直接引用；存储读写在 settings.ts。

import type { Preset, Settings } from './types';

// 默认值的取舍见 docs/TECH-DESIGN.md「预设」。
// 内置预设的 name 只是存储里的占位：界面上按 id 显示当前语言的译名（presets.ts 的 presetName）。

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
