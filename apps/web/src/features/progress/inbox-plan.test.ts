import { receiptFixture } from '@/test-support/progress-fixtures';
import { describe, expect, it } from 'vitest';
import type { ProgressInbox } from '@chefer/types';
import { inboxKey, planInbox } from './inbox-plan';

const levelUp = {
  from: 7,
  to: 8,
  rank: { id: 'LINE_COOK' as const, title: 'Line Cook', minLevel: 5 },
  rankChanged: false,
};

function inbox(overrides: Partial<ProgressInbox> = {}): ProgressInbox {
  return {
    receipts: [
      receiptFixture({
        id: 'r-fd',
        kind: 'FULL_DAY',
        xp: 15,
        lines: [{ code: 'FULL_DAY', xp: 15 }],
      }),
    ],
    unlocks: [],
    levelUp: null,
    cursor: new Date('2026-10-22T10:00:00Z'),
    ...overrides,
  };
}

const FULL = { celebrations: 'FULL', showXp: true, quiet: false } as const;

describe('planInbox: routing by celebration level', () => {
  it('FULL: a receipt toast, a badge toast and the level-up as a modal', () => {
    const plan = planInbox(
      inbox({
        unlocks: [
          {
            id: 'u1',
            achievementId: 'HOME_CHEF',
            tier: 2,
            title: 'Home Chef',
            icon: '🍳',
            unlockedAt: new Date(),
          },
        ],
        levelUp,
      }),
      FULL,
    );
    expect(plan.toast).toBe('+15 XP · Full day logged · New badge: Home Chef II');
    expect(plan.levelUp).toEqual(levelUp);
  });

  it('SUBTLE: toasts only, the level-up included', () => {
    const plan = planInbox(inbox({ levelUp }), { ...FULL, celebrations: 'SUBTLE' });
    expect(plan.levelUp).toBeNull();
    expect(plan.toast).toBe('+15 XP · Full day logged · Level up: Lv 8');
  });

  it('OFF: nothing at all', () => {
    expect(planInbox(inbox({ levelUp }), { ...FULL, celebrations: 'OFF' })).toEqual({
      toast: null,
      levelUp: null,
    });
  });

  it('skips receipts a screen already shows inline (cook, workout, welcome)', () => {
    const plan = planInbox(
      inbox({
        receipts: [
          receiptFixture({ id: 'a', kind: 'COOK_FINISHED' }),
          receiptFixture({ id: 'b', kind: 'WORKOUT_COMPLETED' }),
          receiptFixture({ id: 'c', kind: 'WORKOUT_PRS' }),
          receiptFixture({ id: 'd', kind: 'WELCOME' }),
        ],
      }),
      FULL,
    );
    expect(plan.toast).toBeNull();
  });

  it('quiet mode drops the receipt toast; hiding XP drops receipts and the level-up', () => {
    expect(planInbox(inbox(), { ...FULL, quiet: true }).toast).toBeNull();
    const hidden = planInbox(inbox({ levelUp }), { ...FULL, showXp: false });
    expect(hidden).toEqual({ toast: null, levelUp: null });
  });

  it('sums a batch of receipts and names the biggest reason', () => {
    const plan = planInbox(
      inbox({
        receipts: [
          receiptFixture({
            id: 'a',
            kind: 'MEAL_LOGGED',
            xp: 10,
            lines: [{ code: 'LOGGED', xp: 10 }],
          }),
          receiptFixture({
            id: 'b',
            kind: 'PROTEIN_GOAL',
            xp: 20,
            lines: [{ code: 'PROTEIN_GOAL', xp: 20 }],
          }),
        ],
      }),
      FULL,
    );
    expect(plan.toast).toBe('+30 XP · Protein goal reached');
  });
});

describe('inboxKey', () => {
  it('is null for an empty inbox and changes with the contents', () => {
    expect(inboxKey({ receipts: [], unlocks: [], levelUp: null, cursor: null })).toBeNull();
    expect(inboxKey(inbox())).toBe('r-fd');
    expect(inboxKey(inbox({ levelUp }))).toBe('r-fd|L8');
  });
});
