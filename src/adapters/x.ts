// X（Twitter）站点适配器：在推文卡片里找出「属于这条推文自己的」GIF。
//
// 识别依据是媒体地址而不是样式类名（X 的 r-xxxx 类名会变）：
//   GIF 视频：https://video.twimg.com/tweet_video/<mediaId>.mp4
//   GIF 封面：https://pbs.twimg.com/tweet_video_thumb/<mediaId>.jpg
//   普通视频是 blob: / amplify_video / ext_tw_video，不会命中。
// 懒加载时 <video> 可能还没有 src，此时用 poster 推导 mp4 地址。

import type { GifSource } from '../core/types';

const GIF_MP4_RE = /^https:\/\/video\.twimg\.com\/tweet_video\/([A-Za-z0-9_-]+)\.mp4(?:[?#]|$)/;
const GIF_POSTER_RE =
  /^https:\/\/pbs\.twimg\.com\/tweet_video_thumb\/([A-Za-z0-9_-]+)\.[a-z]+(?:[?#]|$)/;
const STATUS_HREF_RE = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:[/?#]|$)/;

export const TWEET_SELECTOR = 'article[data-testid="tweet"]';
/** 推文底部操作栏（回复/转发/点赞/书签所在的那一排） */
export const ACTION_BAR_SELECTOR = '[role="group"]';

export const mp4UrlFor = (mediaId: string): string =>
  `https://video.twimg.com/tweet_video/${mediaId}.mp4`;

/** 从 <video> 的 src / poster 解析 GIF 媒体 ID；不是 GIF 返回 null */
export const gifMediaIdFrom = (src: string | null, poster: string | null): string | null =>
  (src && GIF_MP4_RE.exec(src)?.[1]) || (poster && GIF_POSTER_RE.exec(poster)?.[1]) || null;

/** 解析 /<author>/status/<tweetId> 形式的链接 */
export const parseStatusHref = (href: string): { author: string; tweetId: string } | null => {
  const m = STATUS_HREF_RE.exec(href);
  return m?.[1] && m[2] ? { author: m[1], tweetId: m[2] } : null;
};

/**
 * 被引用推文（quote tweet）的容器。它和外层推文在同一个 <article> 里，必须排除，
 * 否则外层推文的按钮会下载到引用推文的 GIF。
 *
 * 待 M1 用真实 DOM 核实：目前假设引用卡片是 article 内部、带 role="link" 的 div。
 */
const isInsideQuote = (el: Element, article: Element): boolean => {
  const quote = el.closest('div[role="link"]');
  return quote !== null && article.contains(quote);
};

/** 取推文自己的作者与 ID：带 <time> 的那个 status 链接 */
export const tweetMetaOf = (article: Element): { author: string; tweetId: string } | null => {
  for (const time of article.querySelectorAll('a[href*="/status/"] time')) {
    const a = time.closest('a');
    if (!a || isInsideQuote(a, article)) continue;
    const meta = parseStatusHref(a.getAttribute('href') ?? '');
    if (meta) return meta;
  }
  return null;
};

/** 找出这条推文自己的所有 GIF（不含引用推文里的），按 DOM 顺序 */
export const findOwnGifs = (article: Element): GifSource[] => {
  const meta = tweetMetaOf(article);
  if (!meta) return [];
  const seen = new Set<string>();
  const result: GifSource[] = [];
  for (const video of article.querySelectorAll('video')) {
    if (isInsideQuote(video, article)) continue;
    const mediaId = gifMediaIdFrom(video.getAttribute('src'), video.getAttribute('poster'));
    if (!mediaId || seen.has(mediaId)) continue;
    seen.add(mediaId);
    result.push({ mediaId, mp4Url: mp4UrlFor(mediaId), ...meta });
  }
  return result;
};
