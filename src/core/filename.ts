import type { GifSource } from './types';

// 文件名模板渲染（C6）。chrome.downloads 的 filename 是相对下载目录的路径，不能含非法字符、不能以 . 开头。

// biome-ignore lint/suspicious/noControlCharactersInRegex: 文件名必须剔除控制字符
const ILLEGAL_RE = /[\\/:*?"<>|\u0000-\u001f]/g;

const sanitize = (s: string): string => s.replace(ILLEGAL_RE, '_').replace(/^\.+/, '').trim();

const ymd = (d: Date): string =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/**
 * @param index 同一推文第几个 GIF（从 1 开始）；total > 1 时才追加 _index
 */
export const renderFilename = (
  template: string,
  subfolder: string,
  source: GifSource,
  index: number,
  total: number,
  now: Date = new Date(),
): string => {
  const vars: Record<string, string> = {
    author: source.author,
    tweetId: source.tweetId,
    date: ymd(now),
  };
  let base = sanitize(template.replace(/\{(\w+)\}/g, (raw, key: string) => vars[key] ?? raw));
  if (!base) base = source.mediaId;
  if (total > 1) base += `_${index}`;
  const dir = subfolder.split('/').map(sanitize).filter(Boolean).join('/');
  return dir ? `${dir}/${base}.gif` : `${base}.gif`;
};
