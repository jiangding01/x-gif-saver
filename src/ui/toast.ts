// 右键菜单兜底（M2-5）的进度提示：只在这条推文上没有「存 GIF」按钮时出现（按钮注入失效、
// 引用卡片里的 GIF），否则状态由按钮自己显示。样式模仿 X 的底部蓝色提示条，放在独立的 Shadow DOM 里。

import { X_FONT } from './font';

const STYLE = `
  :host { all: initial; }
  .toast {
    position: fixed; left: 50%; bottom: 32px; z-index: 2147483647;
    max-width: min(90vw, 480px); padding: 12px 16px; border-radius: 4px;
    background: rgb(29, 155, 240); color: #fff;
    box-shadow: rgba(101, 119, 134, 0.2) 0 0 15px, rgba(101, 119, 134, 0.15) 0 0 3px 1px;
    font: 400 15px/20px ${X_FONT};
    transform: translateX(-50%); opacity: 1;
    transition: opacity 0.2s ease-out;
  }
  .toast[hidden] { display: block; opacity: 0; pointer-events: none; }
  .toast[data-tone="error"] { background: rgb(244, 33, 46); }
  @media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
`;

export type Toast = {
  /** 显示一条提示；autoHideMs 为空时一直显示，直到下一次 show / hide */
  show: (text: string, tone?: 'info' | 'error', autoHideMs?: number) => void;
  hide: () => void;
  remove: () => void;
};

export const createToast = (): Toast => {
  const host = document.createElement('xgs-toast');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const box = document.createElement('div');
  box.className = 'toast';
  box.hidden = true;
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  root.append(style, box);
  let timer: number | undefined;

  const hide = () => {
    window.clearTimeout(timer);
    box.hidden = true;
  };
  return {
    show: (text, tone = 'info', autoHideMs) => {
      if (!host.isConnected) document.body.append(host);
      window.clearTimeout(timer);
      box.textContent = text;
      box.dataset.tone = tone;
      box.hidden = false;
      if (autoHideMs !== undefined) timer = window.setTimeout(hide, autoHideMs);
    },
    hide,
    remove: () => {
      hide();
      host.remove();
    },
  };
};
