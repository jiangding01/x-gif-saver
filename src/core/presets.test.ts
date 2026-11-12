import { describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, DEFAULT_SETTINGS } from './defaults';
import {
  addPreset,
  customCount,
  deletePreset,
  describePreset,
  isBuiltinModified,
  MAX_CUSTOM_PRESETS,
  nextCustomName,
  resetBuiltin,
  restorePreset,
  setDefault,
  updatePreset,
  validatePreset,
} from './presets';
import type { Preset, Settings } from './types';

const base = (): Settings => structuredClone(DEFAULT_SETTINGS);
const byId = (s: Settings, id: string) => s.presets.find((p) => p.id === id) as Preset;
const withCustoms = (n: number): Settings => {
  let s = base();
  for (let i = 0; i < n; i++) s = addPreset(s, byId(s, 'balanced'), `c${i}`);
  return s;
};

describe('describePreset', () => {
  it('一行摘要：尺寸 · 帧率 · 颜色 · 抖动', () => {
    expect(describePreset(byId(base(), 'balanced'))).toBe('最长边 480px · 原帧率 · 256 色 · 抖动');
    expect(describePreset(byId(base(), 'original'))).toBe('原始尺寸 · 原帧率 · 256 色 · 抖动');
    expect(describePreset({ ...byId(base(), 'sticker'), dither: 'none' })).toBe(
      '最长边 320px · ≤ 12fps · 128 色 · 不抖动',
    );
  });
});

describe('validatePreset', () => {
  const s = base();
  const balanced = byId(s, 'balanced');

  it('合法参数没有错误；留空（null）表示原始', () => {
    expect(validatePreset(balanced, s.presets)).toEqual({});
    expect(validatePreset({ ...balanced, maxSide: null, fpsCap: null }, s.presets)).toEqual({});
  });

  it('名称：不能为空、不超过 20 字、不与其他预设重名（同一预设不算重名）', () => {
    expect(validatePreset({ ...balanced, name: '  ' }, s.presets).name).toBe('请填写名称');
    expect(validatePreset({ ...balanced, name: '长'.repeat(21) }, s.presets).name).toContain('20');
    expect(validatePreset({ ...balanced, name: '原画' }, s.presets).name).toBe('已有同名预设');
    expect(validatePreset({ ...balanced, name: '均衡' }, s.presets).name).toBeUndefined();
  });

  it('最长边 64–2048、帧率 1–50 的整数，边界值合法', () => {
    expect(validatePreset({ ...balanced, maxSide: 64, fpsCap: 50 }, s.presets)).toEqual({});
    expect(validatePreset({ ...balanced, maxSide: 2048, fpsCap: 1 }, s.presets)).toEqual({});
    const bad = validatePreset({ ...balanced, maxSide: 63, fpsCap: 51 }, s.presets);
    expect(bad.maxSide).toContain('64–2048');
    expect(bad.fpsCap).toContain('1–50');
    expect(validatePreset({ ...balanced, maxSide: 480.5 }, s.presets).maxSide).toBeDefined();
  });
});

describe('addPreset', () => {
  it('复制模板参数、改名为最小空闲编号、标为自定义、不继承目标体积', () => {
    const s = addPreset(base(), byId(base(), 'sticker'), 'c1');
    const added = byId(s, 'c1');
    expect(added).toMatchObject({
      name: '自定义 1',
      builtin: false,
      maxSide: 320,
      fpsCap: 12,
      colors: 128,
      targetBytes: null,
    });
  });

  it('可用弹窗里填的名称与参数覆盖模板；名称冲突或参数非法时报错', () => {
    const s = addPreset(base(), byId(base(), 'balanced'), 'c1', {
      name: '小表情',
      maxSide: 240,
      fpsCap: 10,
      colors: 64,
      dither: 'none',
    });
    expect(byId(s, 'c1')).toMatchObject({
      name: '小表情',
      maxSide: 240,
      fpsCap: 10,
      colors: 64,
      dither: 'none',
      builtin: false,
    });
    expect(() => addPreset(base(), byId(base(), 'balanced'), 'c2', { name: '均衡' })).toThrow(
      '已有同名预设',
    );
    expect(() => addPreset(base(), byId(base(), 'balanced'), 'c2', { maxSide: 10 })).toThrow(
      '64–2048',
    );
  });

  it('编号取最小空闲：删掉「自定义 1」后再新建，名称回到 1', () => {
    let s = withCustoms(2);
    s = deletePreset(s, 'c0');
    expect(nextCustomName(s)).toBe('自定义 1');
  });

  it(`自定义预设最多 ${MAX_CUSTOM_PRESETS} 个（不含内置）`, () => {
    const s = withCustoms(MAX_CUSTOM_PRESETS);
    expect(customCount(s)).toBe(MAX_CUSTOM_PRESETS);
    expect(() => addPreset(s, byId(s, 'balanced'), 'x')).toThrow('最多');
  });

  it('不修改入参', () => {
    const s = base();
    addPreset(s, byId(s, 'balanced'), 'c1');
    expect(s).toEqual(DEFAULT_SETTINGS);
  });
});

describe('updatePreset', () => {
  it('只合并给出的字段，保留其余字段（含将来新增的字段）', () => {
    const s = updatePreset(base(), 'sticker', { colors: 64 });
    expect(byId(s, 'sticker')).toMatchObject({ colors: 64, targetBytes: 1024 * 1024, fpsCap: 12 });
  });

  it('内置预设不能改名，自定义可以', () => {
    expect(byId(updatePreset(base(), 'balanced', { name: '我的' }), 'balanced').name).toBe('均衡');
    const s = updatePreset(withCustoms(1), 'c0', { name: '表情包小' });
    expect(byId(s, 'c0').name).toBe('表情包小');
  });

  it('预设已被别处删除时报错，不悄悄加回去', () => {
    expect(() => updatePreset(base(), 'gone', { colors: 64 })).toThrow('已被删除');
  });
});

describe('deletePreset / restorePreset / setDefault', () => {
  it('内置预设不能删除', () => {
    expect(() => deletePreset(base(), 'balanced')).toThrow('内置');
  });

  it('删除的是默认预设时，默认回到存储里的「均衡」', () => {
    let s = setDefault(withCustoms(1), 'c0');
    expect(s.defaultPresetId).toBe('c0');
    s = deletePreset(s, 'c0');
    expect(s.defaultPresetId).toBe('balanced');
  });

  it('撤销删除：放回原位置并恢复默认；已存在时不重复添加', () => {
    let s = setDefault(withCustoms(3), 'c1');
    const target = byId(s, 'c1');
    const index = s.presets.indexOf(target);
    s = deletePreset(s, 'c1');
    const fallback = s.defaultPresetId;
    const restored = restorePreset(s, target, index, fallback);
    expect(restored.presets.map((p) => p.id)).toEqual(withCustoms(3).presets.map((p) => p.id));
    expect(restored.defaultPresetId).toBe('c1');
    expect(restorePreset(restored, target, index, fallback)).toBe(restored);
  });

  it('撤销删除时，若用户在删除后已另选默认预设，不覆盖用户的选择', () => {
    let s = setDefault(withCustoms(2), 'c0');
    const target = byId(s, 'c0');
    s = deletePreset(s, 'c0');
    const fallback = s.defaultPresetId;
    s = setDefault(s, 'sticker');
    expect(restorePreset(s, target, 3, fallback).defaultPresetId).toBe('sticker');
  });

  it('设默认只接受存在的预设', () => {
    expect(setDefault(base(), 'sticker').defaultPresetId).toBe('sticker');
    expect(setDefault(base(), 'gone').defaultPresetId).toBe('balanced');
  });
});

describe('isBuiltinModified / resetBuiltin', () => {
  it('逐字段与出厂值比较；自定义预设永远算未修改', () => {
    expect(isBuiltinModified(byId(base(), 'balanced'))).toBe(false);
    const s = updatePreset(base(), 'balanced', { maxSide: 640 });
    expect(isBuiltinModified(byId(s, 'balanced'))).toBe(true);
    expect(isBuiltinModified(byId(withCustoms(1), 'c0'))).toBe(false);
  });

  it('恢复出厂参数', () => {
    const s = resetBuiltin(
      updatePreset(base(), 'sticker', { colors: 64, dither: 'none' }),
      'sticker',
    );
    expect(byId(s, 'sticker')).toEqual(BUILTIN_PRESETS.find((p) => p.id === 'sticker'));
  });
});
