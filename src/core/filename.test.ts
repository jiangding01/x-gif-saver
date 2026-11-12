import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { renderFilename } from './filename';
import type { GifSource } from './types';

const src: GifSource = {
  mediaId: 'HWz0LgxbUAEtAWN',
  mp4Url: 'https://video.twimg.com/tweet_video/HWz0LgxbUAEtAWN.mp4',
  author: 'jiangding01',
  tweetId: '2120459074362114107',
};
const now = new Date(2026, 10, 11);

describe('renderFilename', () => {
  it('默认模板 + 子目录', () => {
    const { filenameTemplate, subfolder } = DEFAULT_SETTINGS;
    expect(renderFilename(filenameTemplate, subfolder, src, 1, 1, now)).toBe(
      'X-GIF/2120459074362114107_jiangding01.gif',
    );
  });

  it('多个 GIF 时追加序号', () => {
    expect(renderFilename('{author}', '', src, 2, 3, now)).toBe('jiangding01_2.gif');
  });

  it('支持 {date}，未知变量原样保留后被清洗', () => {
    expect(renderFilename('{date}-{foo}', '', src, 1, 1, now)).toBe('20261111-{foo}.gif');
  });

  it('清洗非法字符与目录穿越', () => {
    expect(renderFilename('a:b*c', '../x/./y', src, 1, 1, now)).toBe('x/y/a_b_c.gif');
  });

  it('模板渲染为空时回退到媒体 ID', () => {
    expect(renderFilename('...', '', src, 1, 1, now)).toBe('HWz0LgxbUAEtAWN.gif');
  });
});
