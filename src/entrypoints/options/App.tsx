// 设置页（ROADMAP M2-1）：管理 GIF 转换预设。改动即保存，删除可撤销，多标签页实时同步。

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { browser } from '#imports';
import {
  addPreset,
  customCount,
  deletePreset,
  MAX_CUSTOM_PRESETS,
  nextCustomName,
  restorePreset,
  setDefault,
} from '../../core/presets';
import { resolvePreset } from '../../core/settings';
import type { Preset } from '../../core/types';
import { CreatePresetDialog } from './CreatePresetDialog';
import { PresetEditor } from './PresetEditor';
import type { fieldsOf } from './PresetForm';
import { PresetRow } from './PresetRow';
import { mutateSettings, useSettings } from './useSettings';

type Notice =
  | { kind: 'saved' }
  /** restoreDefaultIf：被删的是默认预设时，删除后自动回退到的预设 id（撤销时用来判断要不要恢复默认） */
  | { kind: 'deleted'; preset: Preset; index: number; restoreDefaultIf?: string }
  | { kind: 'error'; message: string };

const SAVED_NOTICE_MS = 1600;
const UNDO_WINDOW_MS = 6000;
/** 新建后高亮新行的时长（与 CSS 动画一致） */
const HIGHLIGHT_MS = 1600;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 插件图标原稿（public/icons/icon.svg），旁边已有文字名称，按装饰图处理 */
const Mark = () => <img className="mark" src="/icons/icon.svg" alt="" width={28} height={28} />;

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

export const App = () => {
  const settings = useSettings();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [creating, setCreating] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const newButton = useRef<HTMLButtonElement>(null);
  const groupName = useId();

  const noticeRef = useRef<Notice | null>(null);
  const show = useCallback((next: Notice, ms: number | null) => {
    window.clearTimeout(noticeTimer.current);
    noticeRef.current = next;
    setNotice(next);
    if (ms !== null) {
      noticeTimer.current = window.setTimeout(() => {
        noticeRef.current = null;
        setNotice(null);
      }, ms);
    }
  }, []);
  // 「已保存」不顶掉撤销提示：删除后 6 秒内的其他保存照常进行，只是不再提示
  const onSaved = useCallback(() => {
    if (noticeRef.current?.kind !== 'deleted') show({ kind: 'saved' }, SAVED_NOTICE_MS);
  }, [show]);
  const onError = useCallback((message: string) => show({ kind: 'error', message }, null), [show]);
  const run = (change: Parameters<typeof mutateSettings>[0]) =>
    mutateSettings(change).then(onSaved, (err: unknown) =>
      onError(err instanceof Error ? err.message : String(err)),
    );

  // 正在编辑的预设被别的标签页删掉了：收起表单
  useEffect(() => {
    if (expanded && settings && !settings.presets.some((p) => p.id === expanded)) {
      setExpanded(null);
    }
  }, [expanded, settings]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  if (!settings) return <main className="page" aria-busy="true" />;

  const current = resolvePreset(settings);
  const atLimit = customCount(settings) >= MAX_CUSTOM_PRESETS;
  const version = browser.runtime.getManifest().version;

  const collapse = (id: string) => {
    setExpanded(null);
    editButtons.current.get(id)?.focus();
  };

  /**
   * 弹窗点「创建」：按最新设置写入，成功后关闭弹窗，把新行滚进视野、短暂高亮并聚焦它的「编辑」按钮。
   * 失败时返回错误文案由弹窗自己显示（主页面的提示会被弹窗遮罩挡住）
   */
  const onCreate = async (fields: ReturnType<typeof fieldsOf>): Promise<string | null> => {
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    try {
      await mutateSettings((s) => addPreset(s, resolvePreset(s), id, fields));
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    setCreating(false);
    onSaved();
    setHighlight(id);
    window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), HIGHLIGHT_MS);
    requestAnimationFrame(() => {
      document
        .getElementById(`item-${id}`)
        ?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      // 弹窗关闭后焦点默认回到「新建预设」；达到上限时它已禁用，所以直接交给新行
      editButtons.current.get(id)?.focus();
    });
    return null;
  };

  const onDelete = (preset: Preset) => {
    const index = settings.presets.findIndex((p) => p.id === preset.id);
    const wasDefault = current.id === preset.id;
    if (expanded === preset.id) setExpanded(null);
    let restoreDefaultIf: string | undefined;
    void mutateSettings((s) => {
      const next = deletePreset(s, preset.id);
      if (wasDefault) restoreDefaultIf = next.defaultPresetId;
      return next;
    }).then(
      () => {
        show({ kind: 'deleted', preset, index, restoreDefaultIf }, UNDO_WINDOW_MS);
        newButton.current?.focus();
      },
      (err: unknown) => onError(err instanceof Error ? err.message : String(err)),
    );
  };

  const onUndo = (n: Extract<Notice, { kind: 'deleted' }>) => {
    noticeRef.current = null;
    void run((s) => restorePreset(s, n.preset, n.index, n.restoreDefaultIf));
  };

  return (
    <main className="page">
      <header className="masthead">
        <div className="brand">
          <Mark />
          <span lang="en">X GIF Saver</span>
        </div>
        <h1>设置</h1>
      </header>

      <section className="section" aria-labelledby="presets-title">
        <div className="section-head">
          <div>
            <h2 id="presets-title">转换预设</h2>
            <p className="section-desc">
              点推文里的 GIF 按钮时，用选中的预设转换。改动立即生效，无需刷新 X。
            </p>
          </div>
          <button
            ref={newButton}
            type="button"
            className="button-outline button-new"
            onClick={() => setCreating(true)}
            disabled={atLimit}
            aria-describedby={atLimit ? 'limit-hint' : undefined}
          >
            <PlusIcon />
            新建预设
          </button>
        </div>
        {atLimit ? (
          <p className="limit-hint" id="limit-hint">
            自定义预设最多 {MAX_CUSTOM_PRESETS} 个，删除一个后才能再新建
          </p>
        ) : null}

        {/* 单选按钮靠同一个 name 组成一组；不用 fieldset 包整个列表，免得读屏对编辑区里的控件反复播报组名 */}
        <div className="list">
          {settings.presets.map((preset) => {
            const editorId = `editor-${preset.id}`;
            const isOpen = expanded === preset.id;
            return (
              <div
                key={preset.id}
                id={`item-${preset.id}`}
                className="item"
                data-highlight={highlight === preset.id}
              >
                <PresetRow
                  ref={(el) => {
                    if (el) editButtons.current.set(preset.id, el);
                    else editButtons.current.delete(preset.id);
                  }}
                  preset={preset}
                  isDefault={current.id === preset.id}
                  expanded={isOpen}
                  editorId={editorId}
                  groupName={groupName}
                  onSetDefault={() => void run((s) => setDefault(s, preset.id))}
                  onToggle={() => (isOpen ? collapse(preset.id) : setExpanded(preset.id))}
                  onDelete={() => onDelete(preset)}
                />
                {isOpen ? (
                  <PresetEditor
                    key={preset.id}
                    preset={preset}
                    all={settings.presets}
                    id={editorId}
                    onClose={() => collapse(preset.id)}
                    onSaved={onSaved}
                    onError={onError}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <CreatePresetDialog
        base={creating ? current : null}
        name={nextCustomName(settings)}
        all={settings.presets}
        onCreate={onCreate}
        onClose={() => setCreating(false)}
      />

      <footer className="colophon">
        <span>版本 {version}</span>
        <span aria-hidden="true">·</span>
        <span>所有转换都在本机完成，不上传任何数据</span>
      </footer>

      <div className="toast-region">
        {notice?.kind === 'error' ? (
          <div className="toast toast-error" role="alert">
            <span>写入设置失败：{notice.message}</span>
            <button type="button" className="toast-action" onClick={() => setNotice(null)}>
              知道了
            </button>
          </div>
        ) : null}
        <div role="status" aria-live="polite">
          {notice?.kind === 'saved' ? <div className="toast toast-quiet">已保存</div> : null}
          {notice?.kind === 'deleted' ? (
            <div className="toast">
              <span>已删除「{notice.preset.name}」</span>
              <button type="button" className="toast-action" onClick={() => onUndo(notice)}>
                撤销
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
};
