import { describe, expect, it } from 'vitest';
import { getQueryState, isNotFoundError } from './query-state';

describe('getQueryState', () => {
  it('is loading until something arrives', () => {
    expect(getQueryState({ data: undefined })).toBe('loading');
    expect(getQueryState({ data: undefined, isError: false })).toBe('loading');
  });

  it('is error when the load failed and there is nothing to show', () => {
    expect(getQueryState({ data: undefined, isError: true })).toBe('error');
  });

  it('keeps showing data when only a background refetch failed', () => {
    expect(getQueryState({ data: { id: 1 }, isError: true })).toBe('data');
  });

  it('is data for any defined value, including falsy ones', () => {
    expect(getQueryState({ data: 0 })).toBe('data');
    expect(getQueryState({ data: '' })).toBe('data');
    expect(getQueryState({ data: null })).toBe('data');
  });

  it('is empty only when the caller says the data is empty', () => {
    expect(getQueryState({ data: [] })).toBe('data');
    expect(getQueryState({ data: [] }, (rows) => rows.length === 0)).toBe('empty');
    expect(getQueryState({ data: [1] }, (rows) => rows.length === 0)).toBe('data');
  });
});

describe('isNotFoundError', () => {
  it('recognises a tRPC NOT_FOUND', () => {
    expect(isNotFoundError({ data: { code: 'NOT_FOUND', httpStatus: 404 } })).toBe(true);
    expect(isNotFoundError({ data: { httpStatus: 404 } })).toBe(true);
  });

  it('does not treat a failed load as not found', () => {
    expect(isNotFoundError(new TypeError('Network request failed'))).toBe(false);
    expect(isNotFoundError({ data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } })).toBe(
      false,
    );
    expect(isNotFoundError({ data: null })).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
