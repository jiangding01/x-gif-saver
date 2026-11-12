// 设置页的数据层：订阅存储变化，所有写入都「读最新值 → 套用纯函数 → 写回」。
// 不拿组件 state 里的旧值去写：多个标签页同时打开设置页，或将来 M2-2 的文件名区块写同一个存储项时，
// 用旧值整份覆盖会把别处的修改冲掉。

import { useEffect, useState } from 'react';
import { settingsItem } from '../../core/settings';
import type { Settings } from '../../core/types';

export const useSettings = (): Settings | null => {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let alive = true;
    void settingsItem.getValue().then((value) => {
      if (alive) setSettings(value);
    });
    const unwatch = settingsItem.watch((value) => setSettings(value));
    return () => {
      alive = false;
      unwatch();
    };
  }, []);
  return settings;
};

/** 本页的写入排成队串行执行：连点两个选项时，第二次一定读到第一次写入后的值 */
let queue: Promise<void> = Promise.resolve();

/** 读最新设置、套用修改、写回；修改函数返回原对象时不写 */
export const mutateSettings = (change: (latest: Settings) => Settings): Promise<void> => {
  const run = queue.then(async () => {
    const latest = await settingsItem.getValue();
    const next = change(latest);
    if (next !== latest) await settingsItem.setValue(next);
  });
  queue = run.catch(() => {});
  return run;
};
