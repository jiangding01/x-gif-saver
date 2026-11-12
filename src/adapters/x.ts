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
/** 推文底部操作栏（回复/转发/点赞/书签所在的那一排），用「含回复按钮」与其他 group 区分 */
const ACTION_BAR_SELECTOR = '[role="group"]';
const REPLY_SELECTOR = '[data-testid="reply"]';
/** 被引用推文（quote tweet）的卡片，2026-11-11 实测（TECH-DESIGN 风险 R2） */
const QUOTE_SELECTOR = 'div[role="link"]';
/** 大图浏览弹窗 */
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]';

/** 一个可挂按钮的位置：container 用于去重，actionBar 是按钮挂载点 */
export type GifTarget = {
  container: Element;
  actionBar: Element;
  sources: GifSource[];
};

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
 * 被引用推文（quote tweet）和外层推文在同一个 <article> 里，必须排除，
 * 否则外层推文的按钮会下载到引用推文的 GIF。
 * 注意：外层推文「复用」别人的 GIF（带来源标注）时，video 在引用卡片之外，算外层自己的。
 */
const isInsideQuote = (el: Element, article: Element): boolean => {
  const quote = el.closest(QUOTE_SELECTOR);
  return quote !== null && article.contains(quote);
};

const isActionBar = (el: Element): boolean => el.querySelector(REPLY_SELECTOR) !== null;

/** GIF 媒体去重后转成 GifSource，按 DOM 顺序 */
const toSources = (
  videos: Iterable<HTMLVideoElement>,
  meta: { author: string; tweetId: string },
): GifSource[] => {
  const seen = new Set<string>();
  const result: GifSource[] = [];
  for (const video of videos) {
    const mediaId = gifMediaIdFrom(video.getAttribute('src'), video.getAttribute('poster'));
    if (!mediaId || seen.has(mediaId)) continue;
    seen.add(mediaId);
    result.push({ mediaId, mp4Url: mp4UrlFor(mediaId), ...meta });
  }
  return result;
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
  const videos = [...article.querySelectorAll('video')].filter((v) => !isInsideQuote(v, article));
  return toSources(videos, meta);
};

/** 推文自己的操作栏：不在引用卡片里、含回复按钮的 [role="group"] */
export const findActionBar = (article: Element): Element | null =>
  [...article.querySelectorAll(ACTION_BAR_SELECTOR)].find(
    (g) => !isInsideQuote(g, article) && isActionBar(g),
  ) ?? null;

/** 时间线、详情页里的一条推文 → 挂载目标；不带 GIF 或找不到操作栏返回 null */
export const tweetTarget = (article: Element): GifTarget | null => {
  const sources = findOwnGifs(article);
  if (sources.length === 0) return null;
  const actionBar = findActionBar(article);
  return actionBar ? { container: article, actionBar, sources } : null;
};

/**
 * 大图浏览弹窗（/<author>/status/<id>/video/1）。实测 GIF 不在任何 article 里，
 * 而是在弹窗的媒体区；底部有一排独立的操作栏。作者与推文 ID 只能从地址栏取。
 */
export const modalTarget = (doc: Document, pathname: string): GifTarget | null => {
  const modal = doc.querySelector(MODAL_SELECTOR);
  if (!modal) return null;
  const meta = parseStatusHref(pathname);
  if (!meta) return null;
  const outsideArticle = (el: Element) => el.closest('article') === null;
  const videos = [...modal.querySelectorAll('video')].filter(outsideArticle);
  const sources = toSources(videos, meta);
  if (sources.length === 0) return null;
  const actionBar = [...modal.querySelectorAll(ACTION_BAR_SELECTOR)].find(
    (g) => outsideArticle(g) && g.querySelector('article') === null && isActionBar(g),
  );
  return actionBar ? { container: modal, actionBar, sources } : null;
};

/** GIF 播放器容器（2026-11-12 实测：X 在它上面拦截右键，浏览器菜单不出现，见 TECH-DESIGN 风险 R4） */
const PLAYER_SELECTOR = '[data-testid="videoComponent"]';

/** 元素所在 GIF 播放器里的 <video>；不在 GIF 播放器里（普通视频、图片、文字）返回 null */
export const gifPlayerAt = (el: Element): HTMLVideoElement | null => {
  const player = el.closest(PLAYER_SELECTOR);
  const video = player?.querySelector('video') ?? (el instanceof HTMLVideoElement ? el : null);
  if (!video) return null;
  return gifMediaIdFrom(video.getAttribute('src'), video.getAttribute('poster')) ? video : null;
};

/** 引用卡片里 GIF 的归属：卡片内 status 链接；拿不到时作者与推文 ID 留空，文件名回退到媒体 ID */
const quoteMetaOf = (quote: Element): { author: string; tweetId: string } => {
  for (const a of quote.querySelectorAll('a[href*="/status/"]')) {
    const meta = parseStatusHref(a.getAttribute('href') ?? '');
    if (meta) return meta;
  }
  return { author: '', tweetId: '' };
};

/**
 * 右键菜单「保存为 GIF」（M2-5）：按右键位置找要保存的 GIF，不依赖操作栏（按钮注入失效时的兜底）。
 * - 右键在 GIF 上：只存这一个；归属取所在推文（引用卡片里的算被引用推文，大图弹窗取地址栏）
 * - 右键在推文其他位置：存这条推文自己的全部 GIF（不含引用推文的）
 * 返回 null 表示这里没有 GIF
 */
export const gifsAt = (el: Element, pathname: string): GifSource[] | null => {
  const video = gifPlayerAt(el);
  const article = el.closest(TWEET_SELECTOR);
  if (video) {
    let meta: { author: string; tweetId: string } | null;
    if (article && isInsideQuote(video, article)) {
      meta = quoteMetaOf(video.closest(QUOTE_SELECTOR) as Element);
    } else if (article) {
      meta = tweetMetaOf(article);
    } else {
      meta = parseStatusHref(pathname);
    }
    const sources = toSources([video], meta ?? { author: '', tweetId: '' });
    return sources.length > 0 ? sources : null;
  }
  if (article) {
    const sources = findOwnGifs(article);
    return sources.length > 0 ? sources : null;
  }
  const modal = el.closest(MODAL_SELECTOR);
  const meta = parseStatusHref(pathname);
  if (modal && meta) {
    const sources = toSources(
      [...modal.querySelectorAll('video')].filter((v) => v.closest('article') === null),
      meta,
    );
    return sources.length > 0 ? sources : null;
  }
  return null;
};
