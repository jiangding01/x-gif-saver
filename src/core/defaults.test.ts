// 设置结构守护（ROADMAP M2-6）：M2 没有改 Settings 结构，settingsItem 仍是 version 1、无迁移。
// 这里保证默认数据合法、写满预设后仍在 chrome.storage.sync 单项上限内；将来改结构时在此补迁移用例。

import { describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, DEFAULT_SETTINGS } from './defaults';
import { validateFilename } from './filename';
import { addPreset, MAX_CUSTOM_PRESETS, NAME_MAX_LENGTH, validatePreset } from './presets';
import type { Settings } from './types';

/** chrome.storage.sync 单项上限（QUOTA_BYTES_PER_ITEM），按 key + JSON 计 */
const SYNC_ITEM_LIMIT = 8192;

describe('默认设置', () => {
  it('内置预设 id 唯一、参数合法，默认预设存在', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of BUILTIN_PRESETS) expect(validatePreset(p, BUILTIN_PRESETS)).toEqual({});
    expect(ids).toContain(DEFAULT_SETTINGS.defaultPresetId);
  });

  it('默认文件名与文件夹合法', () => {
    expect(validateFilename(DEFAULT_SETTINGS)).toEqual({});
  });

  it('写满自定义预设（名称取最长）仍在 sync 单项上限内', () => {
    let s: Settings = DEFAULT_SETTINGS;
    for (let i = 0; i < MAX_CUSTOM_PRESETS; i++) {
      s = addPreset(s, BUILTIN_PRESETS[2] as (typeof BUILTIN_PRESETS)[number], `custom-${i}`, {
        name: `${i}`.padEnd(NAME_MAX_LENGTH, '长'),
      });
    }
    s = { ...s, filenameTemplate: '模'.repeat(100), subfolder: '夹'.repeat(100) };
    const bytes = new TextEncoder().encode(`settings${JSON.stringify(s)}`).length;
    expect(bytes).toBeLessThan(SYNC_ITEM_LIMIT);
  });
});
