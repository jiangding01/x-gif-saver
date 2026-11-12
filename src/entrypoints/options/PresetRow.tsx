// 预设列表的一行：单选（设为默认）+ 抖动色样 + 名称与摘要 + 编辑/删除。展开时下方出现编辑表单。

import { Fragment, forwardRef } from 'react';
import { describePreset, isBuiltinModified } from '../../core/presets';
import type { Preset } from '../../core/types';
import { DitherSwatch } from './DitherSwatch';

type Props = {
  preset: Preset;
  isDefault: boolean;
  expanded: boolean;
  editorId: string;
  groupName: string;
  onSetDefault: () => void;
  onToggle: () => void;
  onDelete: () => void;
};

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 4.5h6M4.5 7h15M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7M10.25 10.5v5.5M13.75 10.5v5.5" />
  </svg>
);

export const PresetRow = forwardRef<HTMLButtonElement, Props>(function PresetRow(
  { preset, isDefault, expanded, editorId, groupName, onSetDefault, onToggle, onDelete },
  editButtonRef,
) {
  const modified = isBuiltinModified(preset);
  return (
    <div className="row" data-expanded={expanded} data-default={isDefault}>
      <label className="row-main">
        <input
          type="radio"
          className="radio"
          name={groupName}
          checked={isDefault}
          onChange={onSetDefault}
          aria-describedby={`${editorId}-summary`}
        />
        <DitherSwatch colors={preset.colors} dither={preset.dither} crop={22} className="swatch" />
        <span className="row-text">
          <span className="row-title">
            <span className="sr-only">设为默认预设：</span>
            <span className="row-name">{preset.name}</span>
            {isDefault ? <span className="tag tag-accent">默认</span> : null}
            {preset.builtin ? (
              <span className="tag">{modified ? '内置 · 已调整' : '内置'}</span>
            ) : null}
          </span>
          <span className="row-summary" id={`${editorId}-summary`}>
            {/* 按「 · 」分段、段内不断行：窄屏换行只发生在两段之间，不会断在「原帧/率」中间 */}
            {describePreset(preset)
              .split(' · ')
              .map((part, i) => (
                <Fragment key={part}>
                  {i > 0 ? ' · ' : null}
                  <span className="summary-part">{part}</span>
                </Fragment>
              ))}
          </span>
        </span>
      </label>
      <div className="row-actions">
        <button
          ref={editButtonRef}
          type="button"
          className="button-text"
          aria-expanded={expanded}
          aria-controls={editorId}
          aria-label={`${expanded ? '收起' : '编辑'}「${preset.name}」`}
          onClick={onToggle}
        >
          {expanded ? '收起' : '编辑'}
        </button>
        {preset.builtin ? null : (
          <button
            type="button"
            className="button-icon"
            aria-label={`删除「${preset.name}」`}
            title="删除"
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  );
});
