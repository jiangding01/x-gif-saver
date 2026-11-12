// 预设管理（ROADMAP M2-1）：设置页的所有修改都经过这里的纯函数，UI 只负责展示与调用。
// 全部返回新对象、不改入参；调用方应先读存储里的最新值再套用（见 options/useSettings.ts），
// 避免多个标签页或其他设置区块的写入互相覆盖。

import { i18n } from '#i18n';
import { BUILTIN_PRESETS } from './defaults';
import type { Preset, Settings } from './types';

/** 自定义预设上限（不含内置）。chrome.storage.sync 单项 8KB，13 个预设约 2KB */
export const MAX_CUSTOM_PRESETS = 10;
export const NAME_MAX_LENGTH = 20;
export const MAX_SIDE_RANGE = { min: 64, max: 2048 } as const;
export const FPS_CAP_RANGE = { min: 1, max: 50 } as const;
/** 目标体积（MB），留空表示不限 */
export const TARGET_MB_RANGE = { min: 0.1, max: 100 } as const;
const MB = 1024 * 1024;
/** 默认预设失效时的回退目标 */
export const FALLBACK_PRESET_ID = 'balanced';

/** 参数里会被用户编辑、需要校验与比较的字段 */
export type PresetParams = Pick<Preset, 'maxSide' | 'fpsCap' | 'colors' | 'dither' | 'targetBytes'>;
export type PresetErrors = Partial<Record<'name' | 'maxSide' | 'fpsCap' | 'targetBytes', string>>;

/** 字节 → MB 文本，最多一位小数，去掉多余的 .0（1048576 → "1"） */
export const toMB = (bytes: number): string => String(Math.round((bytes / MB) * 10) / 10);
/** MB → 字节，按 0.1MB 取整 */
export const fromMB = (mb: number): number => Math.round(Math.round(mb * 10) * (MB / 10));

/**
 * 显示用的预设名。内置预设不能改名，名字按 id 取当前语言的译名（存储里的 name 只是占位）；
 * 自定义预设用用户填的名字
 */
export const presetName = (p: Pick<Preset, 'id' | 'name' | 'builtin'>): string => {
  if (!p.builtin) return p.name;
  switch (p.id) {
    case 'original':
      return i18n.t('preset.original');
    case 'balanced':
      return i18n.t('preset.balanced');
    case 'sticker':
      return i18n.t('preset.sticker');
    default:
      return p.name;
  }
};

export const describePreset = (p: Preset): string =>
  [
    p.maxSide === null
      ? i18n.t('preset.originalSize')
      : i18n.t('preset.maxSide', [String(p.maxSide)]),
    // ≤ 后用不换行空格：窄处换行时不把「≤」和数字拆到两行
    p.fpsCap === null ? i18n.t('preset.originalFps') : `≤\u00a0${p.fpsCap}fps`,
    i18n.t('preset.colors', [String(p.colors)]),
    p.dither === 'bayer' ? i18n.t('preset.dither') : i18n.t('preset.noDither'),
    ...(p.targetBytes === null ? [] : [`≤\u00a0${toMB(p.targetBytes)}MB`]),
  ].join(' · ');

/** 范围的上下限，作为文案替换参数 */
export const rangeOf = (range: { min: number; max: number }): [string, string] => [
  String(range.min),
  String(range.max),
];

const isIntIn = (v: number, range: { min: number; max: number }) =>
  Number.isInteger(v) && v >= range.min && v <= range.max;

export const validatePreset = (p: Preset, all: readonly Preset[]): PresetErrors => {
  const errors: PresetErrors = {};
  const name = p.name.trim();
  if (!name) errors.name = i18n.t('preset.nameRequired');
  else if (name.length > NAME_MAX_LENGTH)
    errors.name = i18n.t('preset.nameTooLong', [String(NAME_MAX_LENGTH)]);
  // 与显示名比较：内置预设按当前语言的译名算
  else if (all.some((o) => o.id !== p.id && presetName(o).trim() === name))
    errors.name = i18n.t('preset.nameTaken');
  if (p.maxSide !== null && !isIntIn(p.maxSide, MAX_SIDE_RANGE)) {
    errors.maxSide = i18n.t('preset.maxSideRange', rangeOf(MAX_SIDE_RANGE));
  }
  if (p.fpsCap !== null && !isIntIn(p.fpsCap, FPS_CAP_RANGE)) {
    errors.fpsCap = i18n.t('preset.fpsRange', rangeOf(FPS_CAP_RANGE));
  }
  if (
    p.targetBytes !== null &&
    !(p.targetBytes >= fromMB(TARGET_MB_RANGE.min) && p.targetBytes <= fromMB(TARGET_MB_RANGE.max))
  ) {
    errors.targetBytes = i18n.t('preset.targetRange', rangeOf(TARGET_MB_RANGE));
  }
  return errors;
};

export const customCount = (s: Settings): number => s.presets.filter((p) => !p.builtin).length;

/** 最小的空闲「自定义 N」（按当前语言） */
export const nextCustomName = (s: Settings): string => {
  const used = new Set(s.presets.map((p) => presetName(p).trim()));
  const nameOf = (n: number) => i18n.t('preset.custom', [String(n)]);
  let n = 1;
  while (used.has(nameOf(n))) n++;
  return nameOf(n);
};

/**
 * 以 base 的参数新建自定义预设，追加到末尾；overrides 覆盖名称与参数（「新建预设」弹窗里填的值）。
 * 目标体积（M2-4 起在表单里可见可改）与其他参数一样随模板带入。
 * 写入前按最新设置校验：名称与别处同时新建的预设撞名等情况直接报错
 */
export const addPreset = (
  s: Settings,
  base: Preset,
  id: string,
  overrides: Partial<PresetParams & Pick<Preset, 'name'>> = {},
): Settings => {
  if (customCount(s) >= MAX_CUSTOM_PRESETS) {
    throw new Error(i18n.t('preset.tooMany', [String(MAX_CUSTOM_PRESETS)]));
  }
  const preset: Preset = {
    ...base,
    name: nextCustomName(s),
    ...overrides,
    id,
    builtin: false,
  };
  const errors = Object.values(validatePreset(preset, s.presets));
  if (errors.length > 0) throw new Error(errors.join(i18n.t('save.hintSeparator')));
  return { ...s, presets: [...s.presets, preset] };
};

/** 合并修改到指定预设；预设已被别处删除时报错，不悄悄加回去。内置预设不允许改名 */
export const updatePreset = (
  s: Settings,
  id: string,
  patch: Partial<Omit<Preset, 'id' | 'builtin'>>,
): Settings => {
  const existing = s.presets.find((p) => p.id === id);
  if (!existing) throw new Error(i18n.t('preset.deleted'));
  const { name, ...rest } = patch;
  const next: Preset = {
    ...existing,
    ...rest,
    ...(name !== undefined && !existing.builtin ? { name } : {}),
  };
  return { ...s, presets: s.presets.map((p) => (p.id === id ? next : p)) };
};

/** 默认预设 id 失效时的回退：用户存储里的「均衡」，没有就取第一个 */
export const fallbackDefaultId = (presets: readonly Preset[]): string =>
  presets.find((p) => p.id === FALLBACK_PRESET_ID)?.id ?? presets[0]?.id ?? FALLBACK_PRESET_ID;

export const deletePreset = (s: Settings, id: string): Settings => {
  const target = s.presets.find((p) => p.id === id);
  if (!target) return s;
  if (target.builtin) throw new Error(i18n.t('preset.builtinDelete'));
  const presets = s.presets.filter((p) => p.id !== id);
  const defaultPresetId = s.defaultPresetId === id ? fallbackDefaultId(presets) : s.defaultPresetId;
  return { ...s, presets, defaultPresetId };
};

/**
 * 撤销删除：放回原位置；已存在（别处恢复过）或已达上限时不重复添加。
 * restoreDefaultIf：被删的是默认预设时，删除后自动回退到的预设 id；只有默认仍是它（用户之后没改过）
 * 才把默认恢复成被删的预设，不覆盖用户后来的选择
 */
export const restorePreset = (
  s: Settings,
  preset: Preset,
  index: number,
  restoreDefaultIf?: string,
): Settings => {
  if (s.presets.some((p) => p.id === preset.id)) return s;
  if (!preset.builtin && customCount(s) >= MAX_CUSTOM_PRESETS) return s;
  const presets = [...s.presets];
  presets.splice(Math.min(index, presets.length), 0, preset);
  const defaultPresetId =
    restoreDefaultIf !== undefined && s.defaultPresetId === restoreDefaultIf
      ? preset.id
      : s.defaultPresetId;
  return { ...s, presets, defaultPresetId };
};

export const setDefault = (s: Settings, id: string): Settings =>
  s.presets.some((p) => p.id === id) ? { ...s, defaultPresetId: id } : s;

const factoryOf = (id: string): Preset | undefined => BUILTIN_PRESETS.find((p) => p.id === id);

/** 内置预设的参数是否被用户改过（逐字段与出厂值比较） */
export const isBuiltinModified = (p: Preset): boolean => {
  const factory = p.builtin ? factoryOf(p.id) : undefined;
  if (!factory) return false;
  return (
    p.maxSide !== factory.maxSide ||
    p.fpsCap !== factory.fpsCap ||
    p.colors !== factory.colors ||
    p.dither !== factory.dither ||
    p.targetBytes !== factory.targetBytes
  );
};

export const resetBuiltin = (s: Settings, id: string): Settings => {
  const factory = factoryOf(id);
  if (!factory) return s;
  return { ...s, presets: s.presets.map((p) => (p.id === id ? { ...factory } : p)) };
};
