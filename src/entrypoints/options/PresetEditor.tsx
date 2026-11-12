// 行内编辑：改动即保存（点选类立即保存，文字/数字停顿 400ms 后保存），不设「保存」按钮。
// 校验不通过的值不写入，错误就近显示；正在输入的框不被其他标签页的同步覆盖。

import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { i18n } from '#i18n';
import { isBuiltinModified, resetBuiltin, updatePreset, validatePreset } from '../../core/presets';
import type { Preset } from '../../core/types';
import {
  type ChangeKind,
  draftOf,
  type FormDraft,
  type FormField,
  fieldsOf,
  PresetForm,
} from './PresetForm';
import { mutateSettings } from './useSettings';

type Props = {
  preset: Preset;
  all: readonly Preset[];
  id: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
};

const COMMIT_DELAY_MS = 400;

export const PresetEditor = ({ preset, all, id, onClose, onSaved, onError }: Props) => {
  const [draft, setDraft] = useState<FormDraft>(() => draftOf(preset));
  /** 最近一次从存储同步到的值：草稿里与它相同的字段视为「用户没改过」 */
  const synced = useRef<FormDraft>(draftOf(preset));
  /** 校验通过、还没写入的修改；停顿到时、点选、收起或卸载时一并写入，不会被丢弃 */
  const pending = useRef<Partial<Preset>>({});
  const timer = useRef<number | undefined>(undefined);
  const firstField = useRef<HTMLInputElement>(null);
  const presetId = useRef(preset.id);
  const callbacks = useRef({ onSaved, onError });
  callbacks.current = { onSaved, onError };

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    void mutateSettings((s) => updatePreset(s, presetId.current, patch)).then(
      () => callbacks.current.onSaved(),
      (err: unknown) => callbacks.current.onError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  // 存储里的预设变了（本页保存或其他标签页修改）：只覆盖用户没改过的字段，
  // 用户输入了一半（含暂不合法、未保存的值）的字段保留原样
  useEffect(() => {
    const fresh = draftOf(preset);
    const before = synced.current;
    setDraft((d) => {
      const next = { ...d };
      for (const key of Object.keys(fresh) as FormField[]) {
        if (d[key] === before[key]) (next as Record<FormField, unknown>)[key] = fresh[key];
      }
      return next;
    });
    synced.current = fresh;
  }, [preset]);

  // 展开时聚焦第一个输入框；收起（卸载）时把没写完的修改写入
  useEffect(() => {
    firstField.current?.focus();
    return flush;
  }, [flush]);

  const errors = validatePreset({ ...preset, ...fieldsOf(draft) }, all);

  const onChange = (patch: Partial<FormDraft>, kind: ChangeKind) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const fields = fieldsOf(next);
    const fieldErrors = validatePreset({ ...preset, ...fields }, all);
    for (const key of Object.keys(patch) as FormField[]) {
      // 只保存校验通过的字段；非法的值不写入，也撤回之前排队的旧值
      if (key in fieldErrors) delete pending.current[key];
      else (pending.current as Record<FormField, unknown>)[key] = fields[key];
    }
    if (kind === 'pick') flush();
    else {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, COMMIT_DELAY_MS);
    }
  };

  const report = (p: Promise<void>) =>
    p.then(onSaved, (err: unknown) => onError(err instanceof Error ? err.message : String(err)));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只为在整个表单内捕获 Esc 收起，交互元素都在内部
    <div className="editor" id={id} onKeyDown={onKeyDown}>
      <PresetForm
        draft={draft}
        errors={errors}
        showName={!preset.builtin}
        onChange={onChange}
        firstFieldRef={firstField}
      />
      <div className="form-actions">
        {preset.builtin && isBuiltinModified(preset) ? (
          <button
            type="button"
            className="button-text"
            onClick={() => void report(mutateSettings((s) => resetBuiltin(s, preset.id)))}
          >
            {i18n.t('row.resetBuiltin')}
          </button>
        ) : null}
        <button type="button" className="button-outline" onClick={onClose}>
          {i18n.t('row.done')}
        </button>
      </div>
    </div>
  );
};
