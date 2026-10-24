import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DEFAULT_PROGRESS_SETTINGS } from '@chefer/types';
import type { ProgressInbox, ProgressSettings } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { KitchenReceipt } from '../../src/features/progress/kitchen-receipt';
import { ProgressHost } from '../../src/features/progress/progress-host';
import { planInbox } from '../../src/features/progress/route-inbox';
import { renderWithTrpc } from './friends-core-harness';
import {
  inboxFixture,
  progressOnHandlers,
  receiptFixture,
  summaryFixture,
  turnShellV2Off,
  turnShellV2On,
} from './progress-fixtures';

// ProgressHost (build-plan Lane C §5): the inbox → snackbar / level-up modal /
// nothing, by celebration level; everything acked; the receipt's numbers.

type ReducedMotionGlobal = typeof globalThis & { __REDUCED_MOTION__?: boolean };

const FULL_DAY = receiptFixture({
  id: 'r-full-day',
  kind: 'FULL_DAY',
  sourceId: 'day-1',
  xp: 15,
  lines: [{ code: 'FULL_DAY', xp: 15 }],
});
const UNLOCK = {
  id: 'u1',
  achievementId: 'HOME_CHEF' as const,
  tier: 2,
  title: 'Home Chef',
  icon: '🍳',
  unlockedAt: new Date(2026, 9, 22, 19, 1),
};
const LEVEL_UP = {
  from: 7,
  to: 8,
  rank: { id: 'CHEF_DE_PARTIE' as const, title: 'Chef de Partie', minLevel: 8 },
  rankChanged: true,
};

function settings(over: Partial<ProgressSettings> = {}): ProgressSettings {
  return { ...DEFAULT_PROGRESS_SETTINGS, ...over };
}

beforeEach(() => {
  resetSnackbarForTests();
  turnShellV2On();
  (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = true;
});
afterAll(() => {
  turnShellV2Off();
  (globalThis as ReducedMotionGlobal).__REDUCED_MOTION__ = false;
});

describe('planInbox', () => {
  const ctx = { celebrations: 'FULL' as const, showXp: true, quiet: false };
  const busy: ProgressInbox = inboxFixture({
    receipts: [FULL_DAY],
    unlocks: [UNLOCK],
    levelUp: LEVEL_UP,
  });

  it('FULL: a snackbar for the receipt and the badge, the level-up as a modal', () => {
    const plan = planInbox(busy, ctx);
    expect(plan.messages).toEqual(['+15 XP · Full day logged', 'New badge: Home Chef II']);
    expect(plan.levelUpModal).toEqual(LEVEL_UP);
    // The modal's own level is acked when it closes.
    expect(plan.ack).toEqual({ upTo: busy.cursor, unlockIds: ['u1'] });
  });

  it('SUBTLE: snackbars only, the level-up included', () => {
    const plan = planInbox(busy, { ...ctx, celebrations: 'SUBTLE' });
    expect(plan.levelUpModal).toBeNull();
    expect(plan.messages).toEqual([
      '+15 XP · Full day logged',
      'Level up! Level 8 · Chef de Partie',
      'New badge: Home Chef II',
    ]);
    expect(plan.ack).toEqual({ upTo: busy.cursor, unlockIds: ['u1'], level: 8 });
  });

  it('OFF: shows nothing but still acks everything', () => {
    const plan = planInbox(busy, { ...ctx, celebrations: 'OFF' });
    expect(plan.messages).toEqual([]);
    expect(plan.levelUpModal).toBeNull();
    expect(plan.ack).toEqual({ upTo: busy.cursor, unlockIds: ['u1'], level: 8 });
  });

  it('skips receipts their own screen shows, and the welcome', () => {
    const plan = planInbox(
      inboxFixture({
        receipts: [
          receiptFixture({ id: 'c', kind: 'COOK_FINISHED' }),
          receiptFixture({ id: 'w', kind: 'WORKOUT_COMPLETED' }),
          receiptFixture({ id: 'p', kind: 'WORKOUT_PRS' }),
          receiptFixture({ id: 'h', kind: 'WELCOME' }),
        ],
      }),
      ctx,
    );
    expect(plan.messages).toEqual([]);
    expect(plan.ack?.upTo).toBeTruthy();
  });

  it('"Show XP & levels" off drops the XP and level-up, but badges still announce themselves', () => {
    const plan = planInbox(busy, { ...ctx, showXp: false });
    expect(plan.messages).toEqual(['New badge: Home Chef II']);
    expect(plan.levelUpModal).toBeNull();
    expect(plan.ack?.level).toBe(8);
  });

  it('quiet drops the food receipts', () => {
    const plan = planInbox(busy, { ...ctx, quiet: true });
    expect(plan.messages).toEqual(['New badge: Home Chef II']);
  });

  it('does nothing for an empty inbox', () => {
    expect(planInbox(inboxFixture(), ctx)).toEqual({
      messages: [],
      levelUpModal: null,
      ack: null,
    });
  });
});

describe('ProgressHost', () => {
  it('FULL: shows the snackbar and the level-up modal, then acks', async () => {
    const ack = jest.fn(() => ({}));
    const inbox = inboxFixture({ receipts: [FULL_DAY], levelUp: LEVEL_UP });
    const { calls } = await renderWithTrpc(
      <ProgressHost signedIn />,
      progressOnHandlers(summaryFixture({ settings: settings({ celebrations: 'FULL' }) }), {
        'progress.inbox': () => inbox,
        'progress.ack': ack,
      }),
    );
    expect(await screen.findByText('+15 XP · Full day logged')).toBeTruthy();
    expect(await screen.findByTestId('level-up-modal')).toBeTruthy();
    expect(screen.getByTestId('level-up-rank')).toHaveTextContent('Chef de Partie');
    expect(screen.getByTestId('level-up-level')).toHaveTextContent('8');
    expect(screen.getByTestId('level-up-biscuit-text')).toBeTruthy();
    await waitFor(() => expect(ack).toHaveBeenCalledWith({ upTo: inbox.cursor }));

    await fireEvent.press(screen.getByTestId('level-up-continue'));
    await waitFor(() => expect(ack).toHaveBeenCalledWith({ level: 8 }));
    expect(screen.queryByTestId('level-up-modal')).toBeNull();
    expect(calls.filter((c) => c.path === 'progress.ack')).toHaveLength(2);
  });

  it('SUBTLE: a snackbar for the level-up and no modal', async () => {
    const ack = jest.fn(() => ({}));
    await renderWithTrpc(
      <ProgressHost signedIn />,
      progressOnHandlers(summaryFixture({ settings: settings({ celebrations: 'SUBTLE' }) }), {
        'progress.inbox': () => inboxFixture({ levelUp: LEVEL_UP }),
        'progress.ack': ack,
      }),
    );
    expect(await screen.findByText('Level up! Level 8 · Chef de Partie')).toBeTruthy();
    expect(screen.queryByTestId('level-up-modal')).toBeNull();
    await waitFor(() => expect(ack).toHaveBeenCalledWith(expect.objectContaining({ level: 8 })));
  });

  it('OFF: shows nothing at all, but acks', async () => {
    const ack = jest.fn(() => ({}));
    await renderWithTrpc(
      <ProgressHost signedIn />,
      progressOnHandlers(summaryFixture({ settings: settings({ celebrations: 'OFF' }) }), {
        'progress.inbox': () =>
          inboxFixture({ receipts: [FULL_DAY], unlocks: [UNLOCK], levelUp: LEVEL_UP }),
        'progress.ack': ack,
      }),
    );
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('+15 XP · Full day logged')).toBeNull();
    expect(screen.queryByText('New badge: Home Chef II')).toBeNull();
    expect(screen.queryByTestId('level-up-modal')).toBeNull();
  });

  it('reads nothing and shows nothing when the server says the feature is off', async () => {
    const { paths } = await renderWithTrpc(<ProgressHost signedIn />, {
      ...progressOnHandlers(),
      'progress.availability': () => ({ enabled: false }),
    });
    await waitFor(() => expect(paths()).toContain('progress.availability'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(paths().filter((p) => p.startsWith('progress.') && p !== 'progress.finishCook')).toEqual(
      ['progress.availability'],
    );
  });

  it('works for an allowlisted user while the global flag is off (dogfood)', async () => {
    const { paths } = await renderWithTrpc(<ProgressHost signedIn />, {
      ...progressOnHandlers(),
      'profile.flags': () => ({ gamification: false }),
    });
    await waitFor(() => expect(paths()).toContain('progress.inbox'));
  });

  it('renders nothing while signed out', async () => {
    const { paths } = await renderWithTrpc(<ProgressHost signedIn={false} />, progressOnHandlers());
    await act(async () => {
      await Promise.resolve();
    });
    expect(paths()).toEqual([]);
  });
});

describe('KitchenReceipt', () => {
  it('lists the lines, the total and the level bar', async () => {
    await render(
      <KitchenReceipt
        receipt={receiptFixture()}
        xp={{ total: 1900, level: 7, xpIntoLevel: 385, xpForLevel: 500 }}
      />,
    );
    expect(screen.getByText('Kitchen receipt')).toBeTruthy();
    expect(screen.getByTestId('kitchen-receipt-total')).toHaveTextContent('+45 XP');
    expect(screen.getByText('Cooked at home')).toBeTruthy();
    expect(screen.getByText('First time making this recipe')).toBeTruthy();
    expect(screen.getByText('385 / 500')).toBeTruthy();
    expect(screen.getByText('Lv 7')).toBeTruthy();
    expect(screen.queryByText(/half XP/)).toBeNull();
  });

  it('says so when the soft cap reduced it', async () => {
    await render(<KitchenReceipt receipt={receiptFixture({ capped: true })} />);
    expect(screen.getByText('Busy day: extra actions still count, at half XP.')).toBeTruthy();
  });

  it('adds up: the total is the sum of its lines', () => {
    const r = receiptFixture();
    expect(r.lines.reduce((n, l) => n + l.xp, 0)).toBe(r.xp);
  });
});
