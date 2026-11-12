import { describe, expect, it } from 'vitest';
import { describeError } from '../ui/errorText';
import { errorOf, jobError, toJobError, wrapError } from './errors';

describe('错误码', () => {
  it('jobError 抛出的错误能还原出码与细节', () => {
    expect(toJobError(jobError('fetchFailed', 'HTTP 404'))).toEqual({
      code: 'fetchFailed',
      detail: 'HTTP 404',
    });
    expect(toJobError(jobError('invalidVideo'))).toEqual({ code: 'invalidVideo' });
    expect(toJobError(wrapError('decodeFailed', new Error('boom')))).toEqual({
      code: 'decodeFailed',
      detail: 'boom',
    });
  });

  it('普通异常归为 internal，原始信息放进细节', () => {
    expect(toJobError(new Error('no frames to encode'))).toEqual({
      code: 'internal',
      detail: 'no frames to encode',
    });
    expect(toJobError('x')).toEqual({ code: 'internal', detail: 'x' });
    expect(errorOf('saveFailed', new Error('disk full'))).toEqual({
      code: 'saveFailed',
      detail: 'disk full',
    });
  });

  it('翻译：有细节时跟在原因后面', () => {
    expect(describeError({ code: 'fetchFailed', detail: 'HTTP 404' })).toBe(
      "Couldn't download the GIF video (HTTP 404)",
    );
    expect(describeError({ code: 'cancelled' })).toBe('Cancelled');
    // 不认识的码（版本不一致）按未知错误显示
    expect(describeError({ code: 'nope' as never })).toBe('Unknown error');
  });
});
