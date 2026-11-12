// 「保存位置」区块（C6）：文件夹与文件名模板。保存规则与预设行内编辑一致：
// 停顿 400ms 或离开输入框时保存，校验不通过的值不写入；其他标签页的修改只覆盖用户没动过的框。
// 示例用与 background 相同的 renderFilename 渲染，所见即实际下载路径。

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS } from '../../core/defaults';
import {
  FILENAME_VAR_LABELS,
  FILENAME_VARS,
  type FilenameFields,
  type FilenameVar,
  hasReplacedChars,
  renderFilename,
  SUBFOLDER_MAX_LENGTH,
  TEMPLATE_MAX_LENGTH,
  updateFilename,
  validateFilename,
} from '../../core/filename';
import type { GifSource, Settings } from '../../core/types';
import { mutateSettings } from './useSettings';

type Props = {
  settings: Settings;
  onSaved: () => void;
  onError: (message: string) => void;
};
type Field = keyof FilenameFields;

const COMMIT_DELAY_MS = 400;

/** 示例用的虚构推文 */
const SAMPLE: GifSource = {
  mp4Url: '',
  mediaId: 'HWz0LgxbUAEtAWN',
  author: 'gif_fan',
  tweetId: '1866012345678901234',
};

const pick = (s: Settings): FilenameFields => ({
  filenameTemplate: s.filenameTemplate,
  subfolder: s.subfolder,
});

export const FilenameSection = ({ settings, onSaved, onError }: Props) => {
  const uid = useId();
  const saved = pick(settings);
  const [draft, setDraft] = useState<FilenameFields>(saved);
  const synced = useRef<FilenameFields>(saved);
  const pending = useRef<Partial<FilenameFields>>({});
  const timer = useRef<number | undefined>(undefined);
  const templateInput = useRef<HTMLInputElement>(null);
  /** 插入变量后要放回的光标位置 */
  const caret = useRef<number | null>(null);
  const callbacks = useRef({ onSaved, onError });
  callbacks.current = { onSaved, onError };

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    void mutateSettings((s) => updateFilename(s, patch)).then(
      () => callbacks.current.onSaved(),
      (err: unknown) => callbacks.current.onError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  // 存储变了：只覆盖用户没改过的框，输入了一半的保留
  const { filenameTemplate: savedTemplate, subfolder: savedFolder } = saved;
  useEffect(() => {
    const fresh = { filenameTemplate: savedTemplate, subfolder: savedFolder };
    const before = synced.current;
    setDraft((d) => ({
      filenameTemplate:
        d.filenameTemplate === before.filenameTemplate
          ? fresh.filenameTemplate
          : d.filenameTemplate,
      subfolder: d.subfolder === before.subfolder ? fresh.subfolder : d.subfolder,
    }));
    synced.current = fresh;
  }, [savedTemplate, savedFolder]);

  // 关闭设置页前把没写完的修改写入
  useEffect(() => flush, [flush]);

  const errors = validateFilename(draft);

  const change = (patch: Partial<FilenameFields>, now: boolean) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const nextErrors = validateFilename(next);
    for (const key of Object.keys(patch) as Field[]) {
      if (key in nextErrors) delete pending.current[key];
      else pending.current[key] = next[key];
    }
    window.clearTimeout(timer.current);
    if (now) flush();
    else timer.current = window.setTimeout(flush, COMMIT_DELAY_MS);
  };

  /** 在光标处插入变量，插入后光标落在变量后面 */
  const insertVar = (v: FilenameVar) => {
    const input = templateInput.current;
    const text = draft.filenameTemplate;
    const token = `{${v}}`;
    if (text.length + token.length > TEMPLATE_MAX_LENGTH) return;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    caret.current = start + token.length;
    change({ filenameTemplate: text.slice(0, start) + token + text.slice(end) }, false);
  };

  // 受控输入框改值后光标会跳到末尾：DOM 更新后立刻放回插入点（键盘操作按钮时顺便把焦点还给输入框）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在模板文字变化后执行
  useLayoutEffect(() => {
    const at = caret.current;
    if (at === null) return;
    caret.current = null;
    templateInput.current?.focus();
    templateInput.current?.setSelectionRange(at, at);
  }, [draft.filenameTemplate]);

  const isDefault =
    draft.filenameTemplate === DEFAULT_SETTINGS.filenameTemplate &&
    draft.subfolder === DEFAULT_SETTINGS.subfolder;

  // 有错的框不会写入，示例按实际下载会用的值渲染：合法的取输入值，有错的取已保存的值
  const invalid = Object.keys(errors).length > 0;
  const effective: FilenameFields = {
    filenameTemplate: errors.filenameTemplate ? saved.filenameTemplate : draft.filenameTemplate,
    subfolder: errors.subfolder ? saved.subfolder : draft.subfolder,
  };
  const example = renderFilename(effective.filenameTemplate, effective.subfolder, SAMPLE, 1, 1);
  const parts = example.split('/');
  const file = parts.pop() as string;

  const describedBy = (field: Field, hintId: string) =>
    [errors[field] ? `${uid}-${field}-error` : null, hintId].filter(Boolean).join(' ');

  const templateHints: string[] = [];
  if (hasReplacedChars(draft.filenameTemplate, false))
    templateHints.push('/ : * ? 等字符不能用在文件名里，会换成 _');
  if (!draft.filenameTemplate.includes('{tweetId}'))
    templateHints.push('不含推文 ID 时可能重名，浏览器会在后面加 (1)、(2)');

  return (
    <section className="section" aria-labelledby={`${uid}-title`}>
      <div className="section-head">
        <div>
          <h2 id={`${uid}-title`}>保存位置</h2>
          <p className="section-desc">GIF 存到浏览器的下载目录里，改动立即生效。</p>
        </div>
        {isDefault ? null : (
          <button
            type="button"
            className="button-text"
            onClick={() =>
              change(
                {
                  filenameTemplate: DEFAULT_SETTINGS.filenameTemplate,
                  subfolder: DEFAULT_SETTINGS.subfolder,
                },
                true,
              )
            }
          >
            恢复默认
          </button>
        )}
      </div>

      <div className="filename">
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-folder`}>
            文件夹
          </label>
          <input
            id={`${uid}-folder`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={SUBFOLDER_MAX_LENGTH}
            placeholder="留空则直接存到下载目录"
            value={draft.subfolder}
            onChange={(e) => change({ subfolder: e.target.value }, false)}
            onBlur={flush}
            aria-invalid={Boolean(errors.subfolder)}
            aria-describedby={describedBy('subfolder', `${uid}-folder-hint`)}
          />
          {errors.subfolder ? (
            <p className="field-error" id={`${uid}-subfolder-error`}>
              {errors.subfolder}
            </p>
          ) : null}
          <p className="field-hint" id={`${uid}-folder-hint`}>
            {hasReplacedChars(draft.subfolder, true)
              ? ': * ? 等字符不能用在文件夹名里，会换成 _'
              : '用 / 分多层，也能用变量，如 X-GIF/{author} 按作者分文件夹；只能存在下载目录里'}
          </p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${uid}-template`}>
            文件名
          </label>
          <div className="affix-input">
            <input
              id={`${uid}-template`}
              ref={templateInput}
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={TEMPLATE_MAX_LENGTH}
              value={draft.filenameTemplate}
              onChange={(e) => change({ filenameTemplate: e.target.value }, false)}
              onBlur={flush}
              aria-invalid={Boolean(errors.filenameTemplate)}
              aria-describedby={describedBy('filenameTemplate', `${uid}-template-hint`)}
            />
            <span className="unit" aria-hidden="true">
              .gif
            </span>
          </div>
          <fieldset className="chips">
            <legend className="sr-only">插入变量</legend>
            <span className="chips-label" aria-hidden="true">
              插入
            </span>
            {FILENAME_VARS.map((v) => (
              <button
                key={v}
                type="button"
                className="chip"
                // 按下时不抢走输入框焦点，才能拿到光标位置
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertVar(v)}
              >
                {FILENAME_VAR_LABELS[v]}
              </button>
            ))}
          </fieldset>
          {errors.filenameTemplate ? (
            <p className="field-error" id={`${uid}-filenameTemplate-error`}>
              {errors.filenameTemplate}
            </p>
          ) : null}
          <p className="field-hint" id={`${uid}-template-hint`}>
            {templateHints.length > 0
              ? templateHints.join('；')
              : '一条推文有多个 GIF 时依次加 _1、_2；日期是下载当天'}
          </p>
        </div>

        <div className="path-preview">
          <span className="path-label">
            {invalid ? '示例（标红的修改没有保存，下载仍按这个来）' : '示例'}
          </span>
          <p className="path">
            <span className="path-dir">下载/</span>
            {/* 每层之间留换行机会：窄屏优先在 / 后面换行，而不是把文件名拆开 */}
            {parts.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 路径层级只按位置区分，同名层级合法
              <Fragment key={i}>
                <wbr />
                <span className="path-dir">{p}/</span>
              </Fragment>
            ))}
            <wbr />
            <span className="path-file">{file}</span>
          </p>
        </div>
      </div>
    </section>
  );
};
