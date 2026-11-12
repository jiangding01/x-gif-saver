// 预设表单（纯展示）：行内编辑与「新建预设」弹窗共用。状态与保存方式由外层决定：
// 行内编辑改动即保存，弹窗填完点「创建」才写入。

import { type Ref, useId } from 'react';
import {
  FPS_CAP_RANGE,
  fromMB,
  MAX_SIDE_RANGE,
  NAME_MAX_LENGTH,
  type PresetErrors,
  TARGET_MB_RANGE,
  toMB,
} from '../../core/presets';
import type { DitherMode, Preset } from '../../core/types';
import { DitherSwatch } from './DitherSwatch';

/** 表单里的草稿：数字框保留原始输入文本，便于显示「输了一半」的状态 */
export type FormDraft = {
  name: string;
  maxSide: string;
  fpsCap: string;
  /** 目标体积的 MB 文本（存储里是字节） */
  targetBytes: string;
  colors: Preset['colors'];
  dither: DitherMode;
};
export type FormField = keyof FormDraft;
/** typing：文字/数字输入，停顿后再保存；pick：点选类，立即保存 */
export type ChangeKind = 'typing' | 'pick';

const SIZE_CHOICES = [null, 640, 480, 320, 240] as const;
const FPS_CHOICES = [null, 24, 15, 12, 10] as const;
const TARGET_CHOICES = [null, 1, 2, 5, 8] as const;
const COLOR_CHOICES = [256, 128, 64] as const;

const toText = (v: number | null) => (v === null ? '' : String(v));
/** 留空 = 原始（null）；非整数原样交给校验报错 */
const parseOptional = (text: string): number | null =>
  text.trim() === '' ? null : Number(text.trim());

/** 只留数字；允许小数时最多一个小数点、一位小数 */
const cleanNumber = (text: string, decimal: boolean): string => {
  if (!decimal) return text.replace(/[^\d]/g, '');
  const [int = '', ...rest] = text.replace(/[^\d.]/g, '').split('.');
  return rest.length === 0 ? int : `${int}.${rest.join('').slice(0, 1)}`;
};

export const draftOf = (p: Preset): FormDraft => ({
  name: p.name,
  maxSide: toText(p.maxSide),
  fpsCap: toText(p.fpsCap),
  targetBytes: p.targetBytes === null ? '' : toMB(p.targetBytes),
  colors: p.colors,
  dither: p.dither,
});

/** 草稿 → 预设字段（名称去首尾空格） */
export const fieldsOf = (
  d: FormDraft,
): Pick<Preset, 'name' | 'maxSide' | 'fpsCap' | 'targetBytes' | 'colors' | 'dither'> => {
  const mb = parseOptional(d.targetBytes);
  return {
    name: d.name.trim(),
    maxSide: parseOptional(d.maxSide),
    fpsCap: parseOptional(d.fpsCap),
    // 非数字原样交给校验报错（NaN 不在范围内）
    targetBytes: mb === null ? null : Number.isFinite(mb) ? fromMB(mb) : Number.NaN,
    colors: d.colors,
    dither: d.dither,
  };
};

type Props = {
  draft: FormDraft;
  errors: PresetErrors;
  showName: boolean;
  onChange: (patch: Partial<FormDraft>, kind: ChangeKind) => void;
  /** 打开时要聚焦的第一个输入框 */
  firstFieldRef?: Ref<HTMLInputElement>;
};

export const PresetForm = ({ draft, errors, showName, onChange, firstFieldRef }: Props) => {
  const uid = useId();

  const errorProps = (field: keyof PresetErrors) =>
    errors[field]
      ? { 'aria-invalid': true, 'aria-describedby': `${uid}-${field}-error` }
      : { 'aria-invalid': false };

  const fieldError = (field: keyof PresetErrors) =>
    errors[field] ? (
      <p className="field-error" id={`${uid}-${field}-error`}>
        {errors[field]}
      </p>
    ) : null;

  const numberField = (
    field: 'maxSide' | 'fpsCap' | 'targetBytes',
    label: string,
    unit: string,
    placeholder: string,
    choices: readonly (number | null)[],
    range: { min: number; max: number },
    isFirst: boolean,
    /** 允许一位小数（体积 MB）；否则只收整数 */
    decimal = false,
    hint = `留空表示不限制，范围 ${range.min}–${range.max}`,
  ) => (
    <div className="field">
      <label className="field-label" htmlFor={`${uid}-${field}`}>
        {label}
      </label>
      <div className="number-input">
        <input
          id={`${uid}-${field}`}
          ref={isFirst ? firstFieldRef : undefined}
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          placeholder={placeholder}
          value={draft[field]}
          onChange={(e) => onChange({ [field]: cleanNumber(e.target.value, decimal) }, 'typing')}
          {...errorProps(field)}
        />
        <span className="unit" aria-hidden="true">
          {unit}
        </span>
      </div>
      <fieldset className="chips">
        <legend className="sr-only">{label}常用值</legend>
        {choices.map((choice) => {
          const text = toText(choice);
          return (
            <button
              key={text || 'original'}
              type="button"
              className="chip"
              aria-pressed={draft[field] === text}
              onClick={() => onChange({ [field]: text }, 'pick')}
            >
              {choice === null ? (decimal ? '不限' : '原始') : `${choice}${decimal ? 'MB' : ''}`}
            </button>
          );
        })}
      </fieldset>
      {fieldError(field)}
      <p className="field-hint">{hint}</p>
    </div>
  );

  return (
    <div className="form">
      <div className="form-preview">
        <DitherSwatch
          colors={draft.colors}
          dither={draft.dither}
          crop={44}
          className="swatch swatch-large"
        />
        <p className="preview-caption">
          {draft.colors} 色{draft.dither === 'bayer' ? ' · 抖动' : ''}
        </p>
      </div>

      <div className="form-fields">
        {showName ? (
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-name`}>
              名称
            </label>
            <input
              id={`${uid}-name`}
              ref={firstFieldRef}
              type="text"
              maxLength={NAME_MAX_LENGTH}
              autoComplete="off"
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value }, 'typing')}
              {...errorProps('name')}
            />
            {fieldError('name')}
          </div>
        ) : null}

        {numberField(
          'maxSide',
          '最长边不超过',
          'px',
          '原始尺寸',
          SIZE_CHOICES,
          MAX_SIDE_RANGE,
          !showName,
        )}
        {numberField('fpsCap', '帧率不超过', 'fps', '原帧率', FPS_CHOICES, FPS_CAP_RANGE, false)}
        {numberField(
          'targetBytes',
          '体积不超过',
          'MB',
          '不限',
          TARGET_CHOICES,
          TARGET_MB_RANGE,
          false,
          true,
          `超出时依次降低颜色数、帧率、尺寸重新转换，最多 4 次；范围 ${TARGET_MB_RANGE.min}–${TARGET_MB_RANGE.max}`,
        )}

        <fieldset className="field">
          <legend className="field-label">颜色数</legend>
          <div className="segmented">
            {COLOR_CHOICES.map((c) => (
              <label key={c} className="segment">
                <input
                  type="radio"
                  name={`${uid}-colors`}
                  value={c}
                  checked={draft.colors === c}
                  onChange={() => onChange({ colors: c }, 'pick')}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
          <p className="field-hint">颜色越少，文件越小，渐变处越容易出现色块</p>
        </fieldset>

        <div className="field field-inline">
          <label className="switch" htmlFor={`${uid}-dither`}>
            <input
              id={`${uid}-dither`}
              type="checkbox"
              role="switch"
              aria-checked={draft.dither === 'bayer'}
              checked={draft.dither === 'bayer'}
              onChange={(e) => onChange({ dither: e.target.checked ? 'bayer' : 'none' }, 'pick')}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-text">
              <span className="field-label">抖动</span>
              <span className="field-hint">用细密网点模拟过渡色，渐变更平滑，体积略大</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};
