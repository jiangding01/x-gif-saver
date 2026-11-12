import type { GifSource, Settings } from './types';

// 文件名模板渲染与校验（C6）。chrome.downloads 的 filename 是相对下载目录的路径，
// 每一层都要能在 Windows / macOS / Linux 上落盘，否则 Chrome 会拒绝或退回 UUID 文件名。
// 设置页的示例和 background 的实际下载都调用 renderFilename，保证两边一致。

/** 模板里可用的变量，顺序即设置页「插入」按钮的顺序 */
export const FILENAME_VARS = ['tweetId', 'author', 'date'] as const;
export type FilenameVar = (typeof FILENAME_VARS)[number];
export const FILENAME_VAR_LABELS: Record<FilenameVar, string> = {
  tweetId: '推文 ID',
  author: '作者',
  date: '日期',
};

export const TEMPLATE_MAX_LENGTH = 100;
export const SUBFOLDER_MAX_LENGTH = 100;
/** 每一层按 UTF-8 截断的上限：系统上限 255 字节，给 _N、.gif 和浏览器去重加的「 (1)」留出余量 */
const SEGMENT_MAX_BYTES = 200;

// 文件名里不能出现的字符：Windows 保留符号、控制字符，以及能把 gif.exe 显示成 exe.gif 的 Unicode 方向控制符
const ILLEGAL_CHARS =
  '\\\\/:*?"<>|\\u0000-\\u001f\\u007f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff';
const ILLEGAL_RE = new RegExp(`[${ILLEGAL_CHARS}]`, 'g');
/** Windows 保留设备名（带不带扩展名都不行） */
const RESERVED_RE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const VAR_RE = /\{(\w+)\}/g;

const isVar = (key: string): key is FilenameVar =>
  (FILENAME_VARS as readonly string[]).includes(key);

const encoder = new TextEncoder();
const truncateBytes = (s: string, max: number): string => {
  if (encoder.encode(s).length <= max) return s;
  let out = '';
  let bytes = 0;
  for (const ch of s) {
    bytes += encoder.encode(ch).length;
    if (bytes > max) break;
    out += ch;
  }
  return out;
};

/** 清洗路径中的一层：替换非法字符，去掉开头的点和空白、结尾的点和空白，避开保留名，限制长度 */
export const sanitizeSegment = (s: string): string => {
  let out = s.replace(ILLEGAL_RE, '_').replace(/^[.\s]+/, '');
  out = truncateBytes(out, SEGMENT_MAX_BYTES).replace(/[.\s]+$/, '');
  return RESERVED_RE.test(out) ? `${out}_` : out;
};

const ymd = (d: Date): string =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

const expand = (text: string, vars: Record<FilenameVar, string>): string =>
  text.replace(VAR_RE, (raw, key: string) => (isVar(key) ? vars[key] : raw));

/**
 * @param subfolder 相对下载目录的文件夹，可多层（/ 或 \ 分隔），可用与模板相同的变量
 * @param index 同一推文第几个 GIF（从 1 开始）；total > 1 时才追加 _index
 * @param now {date} 取下载当天
 */
export const renderFilename = (
  template: string,
  subfolder: string,
  source: GifSource,
  index: number,
  total: number,
  now: Date = new Date(),
): string => {
  const vars: Record<FilenameVar, string> = {
    tweetId: source.tweetId,
    author: source.author,
    date: ymd(now),
  };
  let base = sanitizeSegment(expand(template, vars));
  // 渲染结果里没有任何字母或数字（如作者、推文 ID 都拿不到时只剩「_」）就用媒体 ID
  if (!/[\p{L}\p{N}]/u.test(base)) base = source.mediaId;
  if (total > 1) base += `_${index}`;
  // 「..」「.」清洗后为空，被过滤掉，不会跳出下载目录
  const dir = expand(subfolder, vars).split(/[\\/]/).map(sanitizeSegment).filter(Boolean).join('/');
  return dir ? `${dir}/${base}.gif` : `${base}.gif`;
};

export type FilenameFields = Pick<Settings, 'filenameTemplate' | 'subfolder'>;
export type FilenameErrors = Partial<Record<keyof FilenameFields, string>>;

const unknownVars = (text: string): string[] => [
  ...new Set([...text.matchAll(VAR_RE)].map((m) => m[1] as string).filter((k) => !isVar(k))),
];

const unknownMessage = (names: string[]): string =>
  `不认识 ${names.map((n) => `{${n}}`).join(' ')}，可用的变量：${FILENAME_VARS.map((v) => `{${v}}`).join(' ')}`;

/** 不合法的值不写入存储 */
export const validateFilename = (f: FilenameFields): FilenameErrors => {
  const errors: FilenameErrors = {};
  const badInTemplate = unknownVars(f.filenameTemplate);
  if (f.filenameTemplate.trim() === '') errors.filenameTemplate = '文件名不能为空';
  else if (f.filenameTemplate.length > TEMPLATE_MAX_LENGTH)
    errors.filenameTemplate = `最多 ${TEMPLATE_MAX_LENGTH} 个字符`;
  else if (badInTemplate.length > 0) errors.filenameTemplate = unknownMessage(badInTemplate);
  const badInFolder = unknownVars(f.subfolder);
  if (f.subfolder.length > SUBFOLDER_MAX_LENGTH)
    errors.subfolder = `最多 ${SUBFOLDER_MAX_LENGTH} 个字符`;
  else if (badInFolder.length > 0) errors.subfolder = unknownMessage(badInFolder);
  return errors;
};

/** 输入里有会被换成 _ 的字符（文件夹里的 / 和 \ 是分隔符，不算） */
export const hasReplacedChars = (text: string, isFolder: boolean): boolean => {
  const re = new RegExp(`[${ILLEGAL_CHARS}]`);
  return re.test(isFolder ? text.replace(/[\\/]/g, '') : text);
};

/** 写入文件名设置；没有变化时返回原对象（mutateSettings 据此跳过写入） */
export const updateFilename = (s: Settings, patch: Partial<FilenameFields>): Settings => {
  const changed = (Object.keys(patch) as (keyof FilenameFields)[]).some(
    (k) => patch[k] !== undefined && patch[k] !== s[k],
  );
  return changed ? { ...s, ...patch } : s;
};
