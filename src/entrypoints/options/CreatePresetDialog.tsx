// 「新建预设」弹窗：用原生 <dialog>（自带焦点锁定、Esc 关闭、遮罩，关闭后焦点回到触发按钮）。
// 填完点「创建」才写入存储，取消不留任何痕迹；参数默认取当前默认预设。

import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { validatePreset } from '../../core/presets';
import type { Preset } from '../../core/types';
import { draftOf, type FormDraft, fieldsOf, PresetForm } from './PresetForm';

type Props = {
  /** 打开时的模板（当前默认预设）；null 表示关闭 */
  base: Preset | null;
  name: string;
  all: readonly Preset[];
  /** 返回错误文案（创建失败）或 null（成功） */
  onCreate: (fields: ReturnType<typeof fieldsOf>) => Promise<string | null>;
  onClose: () => void;
};

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);

export const CreatePresetDialog = ({ base, name, all, onCreate, onClose }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (base && !el.open) {
      setDraft({ ...draftOf(base), name });
      setBusy(false);
      setFailure(null);
      el.showModal();
      // 等表单渲染后再聚焦名称并全选，直接打字即可替换「自定义 N」
      requestAnimationFrame(() => {
        firstField.current?.focus();
        firstField.current?.select();
      });
    } else if (!base && el.open) {
      el.close();
    }
  }, [base, name]);

  const errors = draft
    ? validatePreset({ ...(base as Preset), id: '', builtin: false, ...fieldsOf(draft) }, all)
    : {};
  const invalid = Object.keys(errors).length > 0;

  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!draft || invalid || busy) return;
    setBusy(true);
    setFailure(null);
    void onCreate(fieldsOf(draft)).then((error) => {
      setBusy(false);
      setFailure(error);
    });
  };

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="create-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {draft ? (
        <form onSubmit={submit} noValidate>
          <header className="dialog-head">
            <h2 id="create-title">新建预设</h2>
            <button
              type="button"
              className="button-icon button-close"
              aria-label="关闭"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </header>
          <PresetForm
            draft={draft}
            errors={errors}
            showName
            onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
            firstFieldRef={firstField}
          />
          {failure ? (
            <p className="dialog-error" role="alert">
              没能创建：{failure}
            </p>
          ) : null}
          <footer className="form-actions">
            <button type="button" className="button-outline" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="button-primary" disabled={invalid || busy}>
              创建
            </button>
          </footer>
        </form>
      ) : null}
    </dialog>
  );
};
