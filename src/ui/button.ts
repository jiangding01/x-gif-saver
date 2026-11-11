// 推文操作栏里的「存 GIF」按钮（ROADMAP M1-1）。
// 放在 Shadow DOM 里，样式不受 X 影响也不污染 X；视觉模仿 X 原生操作按钮。
// 目前只有空闲态；排队/进度/完成/失败等状态由 M1-5 实现。

import {
  type ContentScriptContext,
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from '#imports';

const LABEL = '保存为 GIF';
const BLUE = 'rgb(29, 155, 240)';
/** 读不到同排原生图标时的兜底：时间线上的实测值，浅色/深色主题相同（2026-11-11） */
const DEFAULT_ICON_PX = 18.75;
const DEFAULT_COLOR = 'rgb(113, 118, 123)';

// :host 要写在 shadow 样式表里并加 !important：WXT 给宿主设了 all: initial !important，
// 宿主上的内联样式会被它覆盖。宿主是操作栏（flex space-between）的子项：不参与伸缩、
// 不挤占原生按钮，也不被拉伸到操作栏高度（弹窗、详情页操作栏约 48px，拉伸后按钮会贴顶）
const STYLE = `
  :host { display: flex !important; flex: 0 0 auto !important; align-self: center !important; }
  button {
    display: flex; align-items: center; justify-content: center;
    width: calc(var(--icon) + 16px); height: calc(var(--icon) + 16px);
    margin: 0; padding: 0; border: 0; border-radius: 9999px;
    background: transparent; color: var(--fg); cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
  }
  button:hover, button:focus-visible { color: ${BLUE}; background: rgba(29, 155, 240, 0.1); }
  button:focus-visible { outline: 2px solid ${BLUE}; outline-offset: -2px; }
  svg { width: var(--icon); height: var(--icon); fill: none; stroke: currentColor; }
  text { fill: currentColor; stroke: none; font: 700 7px system-ui, sans-serif; }
`;

// 上半部分写「GIF」，下面一个向下的箭头落在托盘里
const ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <text x="12" y="7.5" text-anchor="middle">GIF</text>
    <path d="M12 10.5v7M8.5 14.5 12 18l3.5-3.5M4 15v4.5h16V15" />
  </svg>
`;

/**
 * 跟随同一排原生图标（点赞/回复）的尺寸与颜色：
 * 时间线 18.75px 灰色，详情页焦点推文 22.5px 灰色，大图弹窗 22.5px 白色（2026-11-11 实测）
 */
const nativeIconLook = (actionBar: Element): { size: number; color: string } => {
  const svg = actionBar.querySelector('[data-testid="like"] svg, [data-testid="reply"] svg');
  const size = svg?.getBoundingClientRect().height ?? 0;
  return {
    size: size > 0 ? size : DEFAULT_ICON_PX,
    color: svg ? getComputedStyle(svg).color : DEFAULT_COLOR,
  };
};

export type SaveButton = ShadowRootContentScriptUi<HTMLButtonElement>;

/** 在操作栏末尾挂一个按钮。点击事件不冒泡，避免触发 X 在推文卡片上的「进入详情页」 */
export const mountSaveButton = async (
  ctx: ContentScriptContext,
  actionBar: Element,
  onClick: () => void,
): Promise<SaveButton> => {
  const ui = await createShadowRootUi(ctx, {
    name: 'xgs-save-button',
    position: 'inline',
    anchor: actionBar,
    append: 'last',
    // 挡住键盘事件冒泡，否则在按钮上按键会触发 X 的 j/k/l 等快捷键
    isolateEvents: true,
    onMount(container) {
      const style = document.createElement('style');
      style.textContent = STYLE;
      const button = document.createElement('button');
      button.type = 'button';
      button.title = LABEL;
      button.setAttribute('aria-label', LABEL);
      const look = nativeIconLook(actionBar);
      button.style.setProperty('--icon', `${look.size}px`);
      button.style.setProperty('--fg', look.color);
      button.innerHTML = ICON;
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      container.append(style, button);
      return button;
    },
  });
  ui.mount();
  return ui;
};
