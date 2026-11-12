import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { i18n } from '#i18n';
import { App } from './App';
import './style.css';

// 页面语言与标题跟随界面语言（index.html 里是英文默认值）
document.documentElement.lang = i18n.t('lang');
document.title = i18n.t('actionTitle');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
