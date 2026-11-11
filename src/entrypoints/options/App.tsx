import { useEffect, useState } from 'react';
import { settingsItem } from '../../core/settings';
import type { Settings } from '../../core/types';

// 设置页骨架：M2-1 实现预设编辑（C1–C5）、M2-2 文件名模板与子目录（C6）。
export const App = () => {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void settingsItem.getValue().then(setSettings);
    return settingsItem.watch(setSettings);
  }, []);

  return (
    <main
      style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui' }}
    >
      <h1>X GIF Saver 设置</h1>
      <p>设置页将在 M2 实现，当前生效的配置：</p>
      <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, overflow: 'auto' }}>
        {settings ? JSON.stringify(settings, null, 2) : '加载中…'}
      </pre>
    </main>
  );
};
