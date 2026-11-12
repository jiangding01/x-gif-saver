// 单测用的 #i18n：直接读 src/locales/en.json，按 chrome.i18n 的规则替换 $1…$9。
// 单测在 Node 里跑，没有 chrome.i18n；vitest.config.ts 把 #i18n 指到这里，断言按英文文案写。

import en from '../locales/en.json';

type Tree = { [key: string]: string | Tree };

const lookup = (key: string): string => {
  let node: string | Tree = en as Tree;
  for (const part of key.split('.')) {
    if (typeof node === 'string' || !(part in node)) throw new Error(`缺少文案：${key}`);
    node = node[part] as string | Tree;
  }
  if (typeof node !== 'string') throw new Error(`不是文案：${key}`);
  return node;
};

export const i18n = {
  t: (key: string, substitutions: readonly (string | number)[] = []): string =>
    lookup(key).replace(/\$(\d)/g, (_, n: string) => String(substitutions[Number(n) - 1] ?? '')),
};
