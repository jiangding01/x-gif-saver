import { storage } from '#imports';
import { BUILTIN_PRESETS, DEFAULT_SETTINGS } from './defaults';
import { fallbackDefaultId } from './presets';
import type { Preset, Settings } from './types';

export { BUILTIN_PRESETS, DEFAULT_SETTINGS };

/**
 * 设置存储项。改 Settings 结构时：version +1，并在 migrations 里写 旧结构 → 新结构 的转换，
 * 不要直接改字段含义，否则老用户的配置会读坏。
 */
export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 1,
});

/**
 * 取要使用的预设：指定的 → 默认的 → 用户存储里的「均衡」→ 第一个 → 出厂「均衡」。
 * 回退与设置页删除默认预设时的规则一致（fallbackDefaultId），用的是用户改过的版本而不是出厂值
 */
export const resolvePreset = (settings: Settings, presetId?: string): Preset => {
  const find = (id: string) => settings.presets.find((p) => p.id === id);
  return (
    find(presetId ?? settings.defaultPresetId) ??
    find(settings.defaultPresetId) ??
    find(fallbackDefaultId(settings.presets)) ??
    (BUILTIN_PRESETS[1] as Preset)
  );
};
