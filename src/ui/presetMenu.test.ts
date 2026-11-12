import { describe, expect, it } from 'vitest';
import { moveIndex, placeMenu, themeFor } from './presetMenu';

const viewport = { width: 1200, height: 800 };
const size = { width: 260, height: 300 };
const anchor = (top: number, left: number) => ({
  top,
  bottom: top + 34,
  left,
  right: left + 34,
});

describe('placeMenu', () => {
  it('默认在按钮下方、右边缘对齐', () => {
    expect(placeMenu(anchor(100, 500), size, viewport)).toEqual({
      top: 138,
      left: 534 - 260,
      maxHeight: 800 - 134 - 4 - 8,
    });
  });

  it('下方放不下就翻到上方', () => {
    const p = placeMenu(anchor(600, 500), size, viewport);
    expect(p.top).toBe(600 - 4 - 300);
    expect(p.maxHeight).toBe(600 - 4 - 8);
  });

  it('上下都放不下时取空间大的一侧并限制高度', () => {
    const tall = { width: 260, height: 900 };
    const p = placeMenu(anchor(300, 500), tall, viewport);
    expect(p.maxHeight).toBe(800 - 334 - 4 - 8);
    expect(p.top).toBe(338);
    const q = placeMenu(anchor(500, 500), tall, viewport);
    expect(q.maxHeight).toBe(500 - 4 - 8);
    expect(q.top).toBe(500 - 4 - q.maxHeight);
  });

  it('左右夹在视口内', () => {
    expect(placeMenu(anchor(100, 10), size, viewport).left).toBe(8);
    expect(placeMenu(anchor(100, 1180), size, { width: 1200, height: 800 }).left).toBe(
      1200 - 8 - 260,
    );
  });
});

describe('moveIndex', () => {
  it('上下循环，Home/End 到两端，其他键不处理', () => {
    expect(moveIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(moveIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(moveIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(moveIndex(1, 'Home', 3)).toBe(0);
    expect(moveIndex(1, 'End', 3)).toBe(2);
    expect(moveIndex(1, 'a', 3)).toBeNull();
    expect(moveIndex(0, 'ArrowDown', 0)).toBeNull();
  });

  it('焦点不在任何一项时（-1）↓ 到第一项', () => {
    expect(moveIndex(-1, 'ArrowDown', 3)).toBe(0);
  });
});

describe('themeFor', () => {
  it('白色、透明或读不到时用浅色主题', () => {
    expect(themeFor('rgb(255, 255, 255)').bg).toBe('#ffffff');
    expect(themeFor('rgba(0, 0, 0, 0)').bg).toBe('#ffffff');
    expect(themeFor('').bg).toBe('#ffffff');
  });

  it('暗蓝与纯黑主题', () => {
    expect(themeFor('rgb(21, 32, 43)').bg).toBe('rgb(21, 32, 43)');
    expect(themeFor('rgb(0, 0, 0)').bg).toBe('#000000');
  });
});
