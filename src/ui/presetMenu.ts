// 「存 GIF」按钮的右键预设菜单（ROADMAP M2-3）：选中的预设只用于这一次下载，不改默认。
// 用原生 Popover（popover="auto"）放在按钮自己的 Shadow DOM 里：进入顶层，不被推文卡片的
// overflow 裁掉，也不用和 X 抢 z-index；点外面、按 Esc 关闭由浏览器负责。
// 视觉模仿 X 的下拉菜单，打开时按页面背景色适配浅色 / 暗蓝 / 纯黑主题。

import { i18n } from '#i18n';
import { X_FONT } from './font';

export type MenuItem = { id: string; name: string; detail: string; isDefault: boolean };
export type MenuHandlers = { onPick: (id: string) => void; onManage: () => void };
export type Rect = { top: number; bottom: number; left: number; right: number };
export type Placement = { top: number; left: number; maxHeight: number };

const GAP = 4;
const MARGIN = 8;

/**
 * 菜单位置：默认在按钮下方、右边缘对齐；下方放不下就翻到上方，都放不下取空间大的一侧并限制高度；
 * 左右夹在视口内
 */
export const placeMenu = (
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): Placement => {
  const below = viewport.height - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  const useBelow = size.height <= below || (size.height > above && below >= above);
  const maxHeight = Math.max(0, useBelow ? below : above);
  const height = Math.min(size.height, maxHeight);
  const left = Math.min(
    Math.max(MARGIN, anchor.right - size.width),
    Math.max(MARGIN, viewport.width - MARGIN - size.width),
  );
  return {
    top: useBelow ? anchor.bottom + GAP : anchor.top - GAP - height,
    left,
    maxHeight,
  };
};

/** 键盘在菜单项之间移动：上下循环，Home / End 到两端；其他键返回 null */
export const moveIndex = (current: number, key: string, count: number): number | null => {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
};

type Theme = { bg: string; fg: string; muted: string; hover: string; line: string; shadow: string };

const parseRgb = (color: string): [number, number, number] | null => {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

/** 按 X 的页面背景选主题：白（默认）、暗蓝 rgb(21,32,43)、纯黑。颜色取自 X 自己的菜单（2026-11 实测） */
export const themeFor = (pageBg: string): Theme => {
  const rgb = parseRgb(pageBg);
  const lightness = rgb ? (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 : 255;
  if (!rgb || lightness > 128) {
    return {
      bg: '#ffffff',
      fg: 'rgb(15, 20, 25)',
      muted: 'rgb(83, 100, 113)',
      hover: 'rgba(15, 20, 25, 0.04)',
      line: 'rgb(239, 243, 244)',
      shadow: 'rgba(101, 119, 134, 0.2) 0 0 15px, rgba(101, 119, 134, 0.15) 0 0 3px 1px',
    };
  }
  const black = rgb[0] + rgb[1] + rgb[2] < 30;
  return {
    bg: black ? '#000000' : 'rgb(21, 32, 43)',
    fg: black ? 'rgb(231, 233, 234)' : 'rgb(247, 249, 249)',
    muted: black ? 'rgb(113, 118, 123)' : 'rgb(139, 152, 165)',
    hover: 'rgba(255, 255, 255, 0.03)',
    line: black ? 'rgb(47, 51, 54)' : 'rgb(56, 68, 77)',
    shadow: 'rgba(255, 255, 255, 0.2) 0 0 15px, rgba(255, 255, 255, 0.15) 0 0 3px 1px',
  };
};

export const MENU_STYLE = `
  .menu {
    position: fixed; inset: auto; margin: 0; padding: 0; border: 0; outline: none;
    min-width: 240px; max-width: 320px; overflow: hidden;
    border-radius: 12px; background: var(--m-bg); color: var(--m-fg);
    box-shadow: var(--m-shadow); font-family: var(--m-font);
    opacity: 1; transform: none;
    transition: opacity 0.12s ease-out, transform 0.12s ease-out, display 0.12s allow-discrete, overlay 0.12s allow-discrete;
  }
  @starting-style { .menu:popover-open { opacity: 0; transform: translateY(-4px); } }
  .menu-body { display: flex; flex-direction: column; max-height: inherit; }
  .menu-title { padding: 12px 16px 4px; color: var(--m-muted); font: 700 13px/16px var(--m-font); }
  .menu-list { overflow-y: auto; overscroll-behavior: contain; }
  .item {
    display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: baseline;
    width: 100%; margin: 0; padding: 10px 16px; border: 0; background: transparent;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .item:hover, .item:focus-visible { background: var(--m-hover); outline: none; }
  .item:focus-visible { box-shadow: inset 0 0 0 2px rgb(29, 155, 240); }
  .name { font: 700 15px/20px var(--m-font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { color: rgb(29, 155, 240); font: 700 12px/20px var(--m-font); }
  .detail { grid-column: 1 / -1; color: var(--m-muted); font: 400 13px/16px var(--m-font); }
  .sep { height: 1px; margin: 4px 0; background: var(--m-line); }
  .manage { grid-template-columns: 1fr; padding-block: 12px; font: 400 15px/20px var(--m-font); }
  @media (prefers-reduced-motion: reduce) { .menu { transition: none; } }
`;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export type PresetMenu = {
  /** viaKeyboard：键盘打开时焦点落在默认预设上；鼠标打开时焦点放在菜单本身，不预先高亮任何一项 */
  open: (
    anchor: HTMLElement,
    items: MenuItem[],
    handlers: MenuHandlers,
    viaKeyboard: boolean,
  ) => void;
  isOpen: () => boolean;
};

/** 在按钮的 shadow 容器里建一个菜单（只建一次，每次打开时重填内容） */
export const createPresetMenu = (container: HTMLElement): PresetMenu => {
  const menu = el('div', 'menu');
  menu.popover = 'auto';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', i18n.t('menu.title'));
  menu.tabIndex = -1;
  container.append(menu);

  let anchorEl: HTMLElement | null = null;
  const items = (): HTMLButtonElement[] => [...menu.querySelectorAll<HTMLButtonElement>('.item')];
  const close = () => {
    if (menu.matches(':popover-open')) menu.hidePopover();
  };
  const onViewportChange = () => close();

  // 菜单在推文卡片里：点击、右键不能冒泡到 X，否则会跳转到推文详情页或弹出浏览器菜单
  for (const type of ['click', 'contextmenu', 'pointerdown', 'mousedown'] as const) {
    menu.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === 'contextmenu') e.preventDefault();
    });
  }
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      close();
      return;
    }
    const list = items();
    const index = list.indexOf(
      (menu.getRootNode() as ShadowRoot).activeElement as HTMLButtonElement,
    );
    // 焦点不在任何一项上时：↓ 到第一项，↑ 到最后一项
    const next = moveIndex(index < 0 ? (e.key === 'ArrowUp' ? 0 : -1) : index, e.key, list.length);
    if (next === null) return;
    e.preventDefault();
    list[next]?.focus();
  });
  // 鼠标移到哪一项，键盘就从哪一项继续
  menu.addEventListener('pointermove', (e) => {
    const item = (e.target as Element).closest<HTMLButtonElement>('.item');
    if (item && item !== (menu.getRootNode() as ShadowRoot).activeElement) {
      item.focus({ preventScroll: true });
    }
  });
  menu.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState === 'open') return;
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
    // 焦点还在菜单里（Esc、Tab、选中后）才还给按钮；点外面关闭时焦点已经去了别处
    const root = menu.getRootNode() as ShadowRoot;
    if (!root.activeElement || menu.contains(root.activeElement)) anchorEl?.focus();
  });

  const open: PresetMenu['open'] = (anchor, list, handlers, viaKeyboard) => {
    if (menu.matches(':popover-open')) return;
    anchorEl = anchor;
    const theme = themeFor(getComputedStyle(document.body).backgroundColor);
    menu.style.setProperty('--m-bg', theme.bg);
    menu.style.setProperty('--m-fg', theme.fg);
    menu.style.setProperty('--m-muted', theme.muted);
    menu.style.setProperty('--m-hover', theme.hover);
    menu.style.setProperty('--m-line', theme.line);
    menu.style.setProperty('--m-shadow', theme.shadow);
    menu.style.setProperty('--m-font', X_FONT);

    const pick = (run: () => void) => () => {
      close();
      run();
    };
    const body = el('div', 'menu-body');
    const scroll = el('div', 'menu-list');
    for (const item of list) {
      const button = el('button', 'item');
      button.type = 'button';
      button.tabIndex = -1;
      button.setAttribute('role', 'menuitem');
      button.append(el('span', 'name', item.name));
      if (item.isDefault) button.append(el('span', 'tag', i18n.t('menu.default')));
      button.append(el('span', 'detail', item.detail));
      button.addEventListener(
        'click',
        pick(() => handlers.onPick(item.id)),
      );
      scroll.append(button);
    }
    const manage = el('button', 'item manage', i18n.t('menu.manage'));
    manage.type = 'button';
    manage.tabIndex = -1;
    manage.setAttribute('role', 'menuitem');
    manage.addEventListener('click', pick(handlers.onManage));
    const sep = el('div', 'sep');
    sep.setAttribute('role', 'separator');
    body.append(el('div', 'menu-title', i18n.t('menu.title')), scroll, sep, manage);
    menu.replaceChildren(body);

    // 先在屏幕外量尺寸，再定位
    menu.style.top = '0px';
    menu.style.left = '-9999px';
    menu.style.maxHeight = '';
    menu.showPopover();
    const size = menu.getBoundingClientRect();
    const place = placeMenu(
      anchor.getBoundingClientRect(),
      { width: size.width, height: size.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    menu.style.top = `${place.top}px`;
    menu.style.left = `${place.left}px`;
    menu.style.maxHeight = `${place.maxHeight}px`;
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });

    // 键盘打开：焦点落在默认预设上，可直接 Enter；鼠标打开：焦点放在菜单上，方向键从第一项开始
    const defaultIndex = Math.max(
      0,
      list.findIndex((i) => i.isDefault),
    );
    const initial = items()[defaultIndex];
    if (viaKeyboard) initial?.focus({ preventScroll: true });
    else menu.focus({ preventScroll: true });
    initial?.scrollIntoView({ block: 'nearest' });
  };

  return { open, isOpen: () => menu.matches(':popover-open') };
};
