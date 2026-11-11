import { describe, expect, it } from 'vitest';
import { gifMediaIdFrom, mp4UrlFor, parseStatusHref } from './x';

describe('gifMediaIdFrom', () => {
  it('从 GIF 视频地址解析媒体 ID', () => {
    expect(gifMediaIdFrom('https://video.twimg.com/tweet_video/HWz0LgxbUAEtAWN.mp4', null)).toBe(
      'HWz0LgxbUAEtAWN',
    );
  });

  it('src 为空时从 poster 推导', () => {
    expect(
      gifMediaIdFrom(null, 'https://pbs.twimg.com/tweet_video_thumb/HWz0LgxbUAEtAWN.jpg'),
    ).toBe('HWz0LgxbUAEtAWN');
  });

  it('普通视频不命中', () => {
    expect(gifMediaIdFrom('blob:https://x.com/1234', null)).toBeNull();
    expect(
      gifMediaIdFrom(null, 'https://pbs.twimg.com/amplify_video_thumb/1846/img/abc.jpg'),
    ).toBeNull();
    expect(
      gifMediaIdFrom('https://video.twimg.com/ext_tw_video/1/pu/vid/480x480/a.mp4', null),
    ).toBeNull();
  });

  it('拼回 mp4 地址', () => {
    expect(mp4UrlFor('HWz0LgxbUAEtAWN')).toBe(
      'https://video.twimg.com/tweet_video/HWz0LgxbUAEtAWN.mp4',
    );
  });
});

describe('parseStatusHref', () => {
  it('解析作者与推文 ID', () => {
    expect(parseStatusHref('/jiangding01/status/2120459074362114107')).toEqual({
      author: 'jiangding01',
      tweetId: '2120459074362114107',
    });
  });

  it('忽略 analytics 等子路径后缀', () => {
    expect(parseStatusHref('/a_b/status/123/analytics')?.tweetId).toBe('123');
  });

  it('非 status 链接返回 null', () => {
    expect(parseStatusHref('/jiangding01')).toBeNull();
  });
});
