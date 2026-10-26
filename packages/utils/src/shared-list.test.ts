import { describe, expect, it } from 'vitest';
import { mergeSyncedChecks } from './shared-list';

const none = new Set<string>();

describe('mergeSyncedChecks', () => {
  it('reports no change and keeps the same array when both sides agree', () => {
    const current = { checkedKeys: ['a', 'b'] };
    const result = mergeSyncedChecks(current, { checkedKeys: ['b', 'a'] }, none);
    expect(result.remoteChanges).toBe(0);
    expect(result.checkedKeys).toBe(current.checkedKeys);
  });

  it('adds keys ticked elsewhere and drops keys unticked elsewhere', () => {
    const result = mergeSyncedChecks(
      { checkedKeys: ['a', 'b'] },
      { checkedKeys: ['a', 'c', 'd'] },
      none,
    );
    expect(result.checkedKeys).toEqual(['a', 'c', 'd']);
    expect(result.remoteChanges).toBe(3);
  });

  it('a pending local tick wins over a sync that has not seen it yet', () => {
    const result = mergeSyncedChecks(
      { checkedKeys: ['a', 'x'] },
      { checkedKeys: ['a'] },
      new Set(['x']),
    );
    expect(result.checkedKeys).toEqual(['a', 'x']);
    expect(result.remoteChanges).toBe(0);
  });

  it('a pending local untick wins over a sync that still has the key ticked', () => {
    const result = mergeSyncedChecks(
      { checkedKeys: [] },
      { checkedKeys: ['x', 'y'] },
      new Set(['x']),
    );
    expect(result.checkedKeys).toEqual(['y']);
    expect(result.remoteChanges).toBe(1);
  });

  it('ignores duplicate keys in the sync answer', () => {
    const result = mergeSyncedChecks({ checkedKeys: [] }, { checkedKeys: ['a', 'a'] }, none);
    expect(result.checkedKeys).toEqual(['a']);
    expect(result.remoteChanges).toBe(1);
  });

  it('an empty sync clears everything that is not pending', () => {
    const result = mergeSyncedChecks(
      { checkedKeys: ['a', 'b'] },
      { checkedKeys: [] },
      new Set(['b']),
    );
    expect(result.checkedKeys).toEqual(['b']);
    expect(result.remoteChanges).toBe(1);
  });
});
