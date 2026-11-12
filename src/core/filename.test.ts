import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import {
  hasReplacedChars,
  renderFilename,
  sanitizeSegment,
  updateFilename,
  validateFilename,
} from './filename';
import type { GifSource } from './types';

const src: GifSource = {
  mediaId: 'HWz0LgxbUAEtAWN',
  mp4Url: 'https://video.twimg.com/tweet_video/HWz0LgxbUAEtAWN.mp4',
  author: 'jiangding01',
  tweetId: '2120459074362114107',
};
const now = new Date(2026, 10, 11);
const render = (template: string, subfolder = '') =>
  renderFilename(template, subfolder, src, 1, 1, now);

describe('renderFilename', () => {
  it('默认模板 + 子目录', () => {
    const { filenameTemplate, subfolder } = DEFAULT_SETTINGS;
    expect(render(filenameTemplate, subfolder)).toBe('X-GIF/2120459074362114107_jiangding01.gif');
  });

  it('多个 GIF 时追加序号', () => {
    expect(renderFilename('{author}', '', src, 2, 3, now)).toBe('jiangding01_2.gif');
  });

  it('{date} 取下载当天；未知变量原样保留', () => {
    expect(render('{date}-{foo}')).toBe('20261111-{foo}.gif');
  });

  it('文件夹支持变量与多层，\\ 也当分隔符', () => {
    expect(render('{tweetId}', 'X-GIF/{author}')).toBe('X-GIF/jiangding01/2120459074362114107.gif');
    expect(render('a', 'X-GIF\\{date}')).toBe('X-GIF/20261111/a.gif');
  });

  it('清洗非法字符与目录穿越', () => {
    expect(render('a:b*c', '../x/./y')).toBe('x/y/a_b_c.gif');
    expect(render('a/b')).toBe('a_b.gif');
    expect(render('x', '/abs//..\\..')).toBe('abs/x.gif');
  });

  it('作者与推文 ID 都拿不到（引用卡片里的 GIF）时回退到媒体 ID', () => {
    const anon = { ...src, author: '', tweetId: '' };
    expect(renderFilename('{tweetId}_{author}', 'X-GIF', anon, 1, 1, now)).toBe(
      'X-GIF/HWz0LgxbUAEtAWN.gif',
    );
  });

  it('模板渲染为空时回退到媒体 ID', () => {
    expect(render('...')).toBe('HWz0LgxbUAEtAWN.gif');
    expect(render('   ')).toBe('HWz0LgxbUAEtAWN.gif');
  });
});

describe('sanitizeSegment', () => {
  it('去掉开头的点与空白、结尾的点与空白', () => {
    expect(sanitizeSegment('  .hidden. . ')).toBe('hidden');
  });

  it('Windows 保留名加下划线，大小写与扩展名都算', () => {
    expect(sanitizeSegment('CON')).toBe('CON_');
    expect(sanitizeSegment('nul.txt')).toBe('nul.txt_');
    expect(sanitizeSegment('com1')).toBe('com1_');
    expect(sanitizeSegment('console')).toBe('console');
  });

  it('替换控制字符与 Unicode 方向控制符', () => {
    expect(sanitizeSegment('a\u0001b‮c﻿')).toBe('a_b_c_');
  });

  it('按 UTF-8 字节截断，不切坏多字节字符', () => {
    const out = sanitizeSegment('表'.repeat(100));
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(200);
    expect(out).toBe('表'.repeat(66));
  });

  it('截断后结尾的点也会被去掉', () => {
    expect(sanitizeSegment(`${'a'.repeat(199)}.b`)).toBe('a'.repeat(199));
  });
});

describe('validateFilename', () => {
  it('默认值合法', () => {
    expect(validateFilename(DEFAULT_SETTINGS)).toEqual({});
  });

  it('模板不能为空，文件夹可以为空', () => {
    expect(validateFilename({ filenameTemplate: ' ', subfolder: '' })).toEqual({
      filenameTemplate: '文件名不能为空',
    });
  });

  it('未知变量报错，同名只列一次', () => {
    const errors = validateFilename({ filenameTemplate: '{foo}{foo}{bar}', subfolder: '{x}' });
    expect(errors.filenameTemplate).toBe(
      '不认识 {foo} {bar}，可用的变量：{tweetId} {author} {date}',
    );
    expect(errors.subfolder).toContain('不认识 {x}');
  });

  it('不把原型上的属性名当成变量', () => {
    expect(validateFilename({ filenameTemplate: '{constructor}', subfolder: '' })).toHaveProperty(
      'filenameTemplate',
    );
  });

  it('超长报错', () => {
    expect(validateFilename({ filenameTemplate: 'a'.repeat(101), subfolder: '' })).toHaveProperty(
      'filenameTemplate',
    );
  });
});

describe('hasReplacedChars', () => {
  it('模板里的 / 会被替换，文件夹里的 / 和 \\ 是分隔符', () => {
    expect(hasReplacedChars('a/b', false)).toBe(true);
    expect(hasReplacedChars('a/b\\c', true)).toBe(false);
    expect(hasReplacedChars('a:b', true)).toBe(true);
    expect(hasReplacedChars('{tweetId}_{author}', false)).toBe(false);
  });
});

describe('updateFilename', () => {
  it('没有变化时返回原对象', () => {
    expect(updateFilename(DEFAULT_SETTINGS, { subfolder: 'X-GIF' })).toBe(DEFAULT_SETTINGS);
  });

  it('只改传入的字段', () => {
    const next = updateFilename(DEFAULT_SETTINGS, { subfolder: 'GIF' });
    expect(next.subfolder).toBe('GIF');
    expect(next.filenameTemplate).toBe(DEFAULT_SETTINGS.filenameTemplate);
    expect(next.presets).toBe(DEFAULT_SETTINGS.presets);
  });
});
