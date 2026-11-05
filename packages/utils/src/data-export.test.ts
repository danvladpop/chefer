import { describe, expect, it } from 'vitest';
import { exportErrorMessage, exportSizeBucket } from './data-export';

describe('exportSizeBucket', () => {
  it('buckets the archive size, never reporting the exact number', () => {
    expect(exportSizeBucket(0)).toBe('<100kb');
    expect(exportSizeBucket(100 * 1024 - 1)).toBe('<100kb');
    expect(exportSizeBucket(100 * 1024)).toBe('100kb-1mb');
    expect(exportSizeBucket(1024 * 1024)).toBe('1mb+');
  });
});

describe('exportErrorMessage', () => {
  it('names the rate limit, and says "try again" for anything else', () => {
    expect(exportErrorMessage({ data: { code: 'TOO_MANY_REQUESTS' } })).toMatch(/15 minutes/);
    expect(exportErrorMessage({ data: { code: 'INTERNAL_SERVER_ERROR' } })).toMatch(/try again/);
    expect(exportErrorMessage(new Error('network'))).toMatch(/try again/);
    expect(exportErrorMessage(null)).toMatch(/try again/);
  });
});
