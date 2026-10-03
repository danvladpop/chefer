import { describe, expect, it, vi } from 'vitest';
import { useQueryState } from './use-query-state';

describe('useQueryState (web)', () => {
  it('maps a failed first load to error and Retry refetches', () => {
    const refetch = vi.fn();
    const result = useQueryState({ data: undefined, isError: true, refetch });
    expect(result.state).toBe('error');
    result.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('is loading, data and empty like the shared function', () => {
    const refetch = vi.fn();
    expect(useQueryState({ data: undefined, refetch }).state).toBe('loading');
    expect(useQueryState({ data: [1], refetch }).state).toBe('data');
    expect(
      useQueryState({ data: [] as number[], refetch }, (rows) => rows.length === 0).state,
    ).toBe('empty');
  });
});
