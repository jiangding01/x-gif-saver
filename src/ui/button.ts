// 推文操作栏里的「存 GIF」按钮（ROADMAP M1-1 / M1-5）。
// 放在 Shadow DOM 里，样式不受 X 影响也不污染 X；视觉模仿 X 原生操作按钮。
// 状态（空闲/排队/转换中/完成/失败）由 content script 算好 ButtonView 后调用 renderButton 刷新。

import {
  type ContentScriptContext,
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from '#imports';
import { createPresetMenu, MENU_STYLE, type PresetMenu } from './presetMenu';
import { type ButtonKind, type ButtonView, idleView } from './state';

const BLUE = 'rgb(29, 155, 240)';
/** X 的成功绿与错误红 */
const GREEN = 'rgb(0, 186, 124)';
const RED = 'rgb(244, 33, 46)';
/** 读不到同排原生图标时的兜底：时间线上的实测值，浅色/深色主题相同（2026-11-11） */
const DEFAULT_ICON_PX = 18.75;
const DEFAULT_COLOR = 'rgb(113, 118, 123)';
/** 进度环半径与周长（viewBox 24×24） */
const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

// 按钮样式只作用于 .save：同一 shadow 里还有预设菜单的按钮，不能用标签选择器。
// :host 要写在 shadow 样式表里并加 !important：WXT 给宿主设了 all: initial !important，
// 宿主上的内联样式会被它覆盖。宿主是操作栏（flex space-between）的子项：不参与伸缩、
// 不挤占原生按钮，也不被拉伸到操作栏高度（弹窗、详情页操作栏约 48px，拉伸后按钮会贴顶）
export const BUTTON_STYLE = `
  :host { display: flex !important; flex: 0 0 auto !important; align-self: center !important; }
  .save {
    display: flex; align-items: center; justify-content: center;
    width: calc(var(--icon) + 16px); height: calc(var(--icon) + 16px);
    margin: 0; padding: 0; border: 0; border-radius: 9999px;
    background: transparent; color: var(--fg); cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
  }
  .save:hover, .save:focus-visible { color: ${BLUE}; background: rgba(29, 155, 240, 0.1); }
  .save:focus-visible { outline: 2px solid ${BLUE}; outline-offset: -2px; }
  .save[data-kind="done"] { color: ${GREEN}; }
  .save[data-kind="error"], .save[data-kind="error"]:hover, .save[data-kind="error"]:focus-visible {
    color: ${RED}; background: rgba(244, 33, 46, 0.1);
  }
  svg { width: var(--icon); height: var(--icon); fill: none; stroke: currentColor; overflow: visible; }
  text { fill: currentColor; stroke: none; font: 700 6.6px system-ui, sans-serif; }
  .track { opacity: 0.25; }
  .arc { transform: rotate(-90deg); transform-origin: 12px 12px; transition: stroke-dasharray 0.2s linear; }
  .spin { transform-origin: 12px 12px; animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* 转换中/排队中：悬停或键盘聚焦时中间出现 ✕，提示「再点一次是取消」 */
  .cancel { opacity: 0; transition: opacity 0.15s; }
  .save:hover .cancel, .save:focus-visible .cancel { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .spin { animation: none; }
    .arc, .cancel, .save { transition: none; }
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }
`;

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const CANCEL_MARK = '<path class="cancel" d="M9.5 9.5l5 5M14.5 9.5l-5 5" />';

const ICONS: Record<Exclude<ButtonKind, 'progress'>, string> = {
  // 上方「GIF」，下方箭头落向托盘；箭头与托盘之间留空，托盘比例对齐 X 原生分享图标
  idle: svg(
    '<text x="12" y="6.4" text-anchor="middle">GIF</text>' +
      '<path d="M12 9.5v5.5M9 12l3 3 3-3M3.5 14.5v4a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4" />',
  ),
  queued: svg(
    `<circle class="track" cx="12" cy="12" r="${RING_R}" />` +
      `<circle class="spin" cx="12" cy="12" r="${RING_R}" stroke-dasharray="${RING_C / 4} ${RING_C}" />` +
      CANCEL_MARK,
  ),
  done: svg('<path d="M5.5 12.5l4 4 9-9" />'),
  error: svg(
    `<circle cx="12" cy="12" r="${RING_R}" /><path d="M12 7.5v5.5" />` +
      '<circle cx="12" cy="16.5" r="0.6" fill="currentColor" />',
  ),
};

const progressIcon = (ratio: number) =>
  svg(
    `<circle class="track" cx="12" cy="12" r="${RING_R}" />` +
      `<circle class="arc" cx="12" cy="12" r="${RING_R}" stroke-dasharray="${(RING_C * ratio).toFixed(2)} ${RING_C.toFixed(2)}" />` +
      CANCEL_MARK,
  );

/**
 * 跟随同一排原生图标（点赞/回复）的尺寸与颜色：
 * 时间线 18.75px 灰色，详情页焦点推文 22.5px 灰色，大图弹窗 22.5px 白色（2026-11-11 实测）
 */
const nativeIconLook = (actionBar: Element): { size: number; color: string } => {
  const icon = actionBar.querySelector('[data-testid="like"] svg, [data-testid="reply"] svg');
  const size = icon?.getBoundingClientRect().height ?? 0;
  return {
    size: size > 0 ? size : DEFAULT_ICON_PX,
    color: icon ? getComputedStyle(icon).color : DEFAULT_COLOR,
  };
};

type ButtonParts = { button: HTMLButtonElement; live: HTMLSpanElement; menu: PresetMenu };
export type SaveButton = ShadowRootContentScriptUi<ButtonParts>;

/** 按视图刷新按钮；完成、失败时通过隐藏的 aria-live 区域播报给读屏 */
export const renderButton = (ui: SaveButton, view: ButtonView): void => {
  const parts = ui.mounted;
  if (!parts) return;
  const { button, live } = parts;
  const prevKind = button.dataset.kind;
  if (prevKind !== view.kind) {
    button.dataset.kind = view.kind;
    if (view.kind !== 'progress') button.innerHTML = ICONS[view.kind];
    if (view.kind === 'done' || view.kind === 'error') {
      // 先清空再写入：同一失败原因连续出现时，读屏也会重新播报
      live.textContent = '';
      requestAnimationFrame(() => {
        live.textContent = view.label;
      });
    }
  }
  if (view.kind === 'progress') {
    const arc = button.querySelector<SVGCircleElement>('.arc');
    if (arc) {
      arc.setAttribute(
        'stroke-dasharray',
        `${(RING_C * view.ratio).toFixed(2)} ${RING_C.toFixed(2)}`,
      );
    } else {
      button.innerHTML = progressIcon(view.ratio);
    }
  }
  button.title = view.label;
  // 转换中的百分比只放在 title：aria-label 每 1% 变一次会让读屏反复朗读
  button.setAttribute('aria-label', view.aria);
  button.setAttribute('aria-busy', String(view.kind === 'queued' || view.kind === 'progress'));
};

/**
 * 右键 / ContextMenu 键 / Shift+F10 的回调：返回 true 表示由我们处理（打开预设菜单），
 * 返回 false 时不拦截，浏览器原生菜单照常出现（例如转换中）
 */
export type ContextMenuHandler = (
  button: HTMLButtonElement,
  menu: PresetMenu,
  viaKeyboard: boolean,
) => boolean;

/** 在操作栏末尾挂一个按钮。点击事件不冒泡，避免触发 X 在推文卡片上的「进入详情页」 */
export const mountSaveButton = async (
  ctx: ContentScriptContext,
  actionBar: Element,
  onClick: () => void,
  onContextMenu: ContextMenuHandler,
  initial: ButtonView = idleView(),
): Promise<SaveButton> => {
  const ui = await createShadowRootUi(ctx, {
    name: 'xgs-save-button',
    position: 'inline',
    anchor: actionBar,
    append: 'last',
    // 挡住键盘事件冒泡，否则在按钮上按键会触发 X 的 j/k/l 等快捷键
    isolateEvents: true,
    onMount(container): ButtonParts {
      const style = document.createElement('style');
      style.textContent = BUTTON_STYLE + MENU_STYLE;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'save';
      const look = nativeIconLook(actionBar);
      button.style.setProperty('--icon', `${look.size}px`);
      button.style.setProperty('--fg', look.color);
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      const live = document.createElement('span');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      container.append(style, button, live);
      const menu = createPresetMenu(container);
      const requestMenu = (e: Event) => {
        // 键盘触发的 contextmenu 没有指针类型（pointerType 为空）
        const viaKeyboard = !(e instanceof PointerEvent) || e.pointerType === '';
        if (!onContextMenu(button, menu, viaKeyboard)) return;
        e.preventDefault();
        e.stopPropagation();
      };
      button.addEventListener('contextmenu', requestMenu);
      // macOS 上 Shift+F10 不会触发 contextmenu 事件，自己接住；Windows 两者都会来，菜单打开是幂等的
      button.addEventListener('keydown', (e) => {
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) requestMenu(e);
      });
      return { button, live, menu };
    },
  });
  ui.mount();
  renderButton(ui, initial);
  return ui;
};
