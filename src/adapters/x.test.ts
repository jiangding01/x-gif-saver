// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findActionBar,
  findOwnGifs,
  gifMediaIdFrom,
  modalTarget,
  mp4UrlFor,
  parseStatusHref,
  tweetTarget,
} from './x';

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

// 以下 DOM 片段按 2026-11-11 在 x.com 实测的结构裁剪，只保留识别依赖的属性（TECH-DESIGN 风险 R2）
const gifVideo = (id: string) =>
  `<video poster="https://pbs.twimg.com/tweet_video_thumb/${id}.jpg" src="https://video.twimg.com/tweet_video/${id}.mp4"></video>`;
const actionBar = `<div role="group"><button data-testid="reply"></button><button data-testid="like"></button><div data-testid="harvester-button"></div></div>`;
const statusTime = (path: string) => `<a href="${path}"><time datetime="2026-11-11"></time></a>`;
/** 引用卡片：time 不在 <a> 里；自带的 role="group" 模拟卡片里可能出现的其他 group */
const quote = (inner: string) =>
  `<div role="link" tabindex="0"><time datetime="2026-11-10"></time>${inner}<div role="group"><button data-testid="reply"></button></div></div>`;
const tweet = (inner: string) =>
  `<article data-testid="tweet">${statusTime('/alice/status/111')}${inner}${actionBar}</article>`;

const mount = (html: string): Element => {
  document.body.innerHTML = html;
  const first = document.body.firstElementChild;
  if (!first) throw new Error('empty fixture');
  return first;
};

describe('findOwnGifs / tweetTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('推文自带 GIF：返回媒体与作者信息', () => {
    const article = mount(tweet(gifVideo('AAA')));
    expect(findOwnGifs(article)).toEqual([
      {
        mediaId: 'AAA',
        mp4Url: 'https://video.twimg.com/tweet_video/AAA.mp4',
        author: 'alice',
        tweetId: '111',
      },
    ]);
    const target = tweetTarget(article);
    expect(target?.actionBar.querySelector('[data-testid="harvester-button"]')).not.toBeNull();
  });

  it('引用推文里的 GIF 不算，外层无 GIF 时不出按钮', () => {
    const article = mount(tweet(quote(gifVideo('QQQ'))));
    expect(findOwnGifs(article)).toEqual([]);
    expect(tweetTarget(article)).toBeNull();
  });

  it('外层与引用都带 GIF：只取引用卡片外的', () => {
    const article = mount(tweet(gifVideo('OUT') + quote(gifVideo('IN'))));
    expect(findOwnGifs(article).map((g) => g.mediaId)).toEqual(['OUT']);
  });

  it('多个 GIF 按 DOM 顺序去重', () => {
    const article = mount(tweet(gifVideo('A1') + gifVideo('A2') + gifVideo('A1')));
    expect(findOwnGifs(article).map((g) => g.mediaId)).toEqual(['A1', 'A2']);
  });

  it('普通视频、图片推文不出按钮', () => {
    const article = mount(
      tweet(
        '<video poster="https://pbs.twimg.com/amplify_video_thumb/1/img/x.jpg" src="blob:https://x.com/1"></video><img src="https://pbs.twimg.com/media/abc.jpg">',
      ),
    );
    expect(tweetTarget(article)).toBeNull();
  });

  it('操作栏不会选到引用卡片里的 group', () => {
    const article = mount(tweet(quote('') + gifVideo('AAA')));
    const bar = findActionBar(article);
    expect(bar?.closest('div[role="link"]')).toBeNull();
    expect(bar?.querySelector('[data-testid="harvester-button"]')).not.toBeNull();
  });

  it('有 GIF 但操作栏还没渲染：返回 null，等下次扫描', () => {
    const article = mount(
      `<article data-testid="tweet">${statusTime('/alice/status/111')}${gifVideo('AAA')}</article>`,
    );
    expect(tweetTarget(article)).toBeNull();
  });
});

describe('modalTarget', () => {
  // 实测：最外层 group 包着整个弹窗（含右侧 article），媒体区与底部操作栏都不在 article 里
  const modal = (media: string) =>
    `<div role="group"><div role="dialog" aria-modal="true">
      <div data-testid="swipe-to-dismiss">${media}</div>
      ${actionBar}
      <article data-testid="tweet">${statusTime('/bob/status/222')}${actionBar}</article>
    </div></div>`;

  it('从弹窗媒体区取 GIF，作者与推文 ID 来自地址栏', () => {
    mount(modal(gifVideo('MMM')));
    const target = modalTarget(document, '/bob/status/222/video/1');
    expect(target?.sources).toEqual([
      {
        mediaId: 'MMM',
        mp4Url: 'https://video.twimg.com/tweet_video/MMM.mp4',
        author: 'bob',
        tweetId: '222',
      },
    ]);
    expect(target?.actionBar.closest('article')).toBeNull();
    expect(target?.actionBar.querySelector('article')).toBeNull();
    expect(target?.container.getAttribute('role')).toBe('dialog');
  });

  it('弹窗里是图片或普通视频：返回 null', () => {
    mount(modal('<img src="https://pbs.twimg.com/media/abc.jpg">'));
    expect(modalTarget(document, '/bob/status/222/photo/1')).toBeNull();
  });

  it('地址栏不是推文地址：返回 null', () => {
    mount(modal(gifVideo('MMM')));
    expect(modalTarget(document, '/i/chat')).toBeNull();
  });

  it('没有弹窗：返回 null', () => {
    mount(tweet(gifVideo('AAA')));
    expect(modalTarget(document, '/alice/status/111')).toBeNull();
  });
});
