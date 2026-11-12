// 各语言文案的键名必须一致：漏翻的键在 Chrome 里会退回英文，这里让 CI 直接报出来。
// 同时检查替换参数（$1…$9）一致，避免译文少了参数、显示不出数字。

import { describe, expect, it } from 'vitest';
import en from './en.json';
import zhCN from './zh_CN.json';

type Tree = { [key: string]: string | Tree };

const flatten = (tree: Tree, prefix = ''): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
};

const params = (message: string) => [...new Set(message.match(/\$\d/g) ?? [])].sort();

const LOCALES: Record<string, Tree> = { zh_CN: zhCN };
const base = flatten(en as Tree);

describe.each(Object.entries(LOCALES))('%s 与 en 一致', (_name, tree) => {
  const other = flatten(tree);

  it('键名完全一致', () => {
    expect([...other.keys()].sort()).toEqual([...base.keys()].sort());
  });

  it('每条文案都非空，用到的参数是英文的子集', () => {
    for (const [key, message] of other) {
      expect(message.trim(), key).not.toBe('');
      const extra = params(message).filter((p) => !params(base.get(key) ?? '').includes(p));
      expect(extra, key).toEqual([]);
    }
  });
});

describe('Chrome 能解析的文案格式', () => {
  // Chrome 把 $名字$ 当具名占位符：「$1$2」会被读成占位符「$1$」，未定义就导致整个扩展加载失败
  it.each(Object.entries({ en, zh_CN: zhCN }))('%s 里没有 $n$ 这样的写法', (_name, tree) => {
    for (const [key, message] of flatten(tree as Tree)) {
      expect(message, key).not.toMatch(/\$\d\$|\$[A-Za-z_]/);
    }
  });
});
