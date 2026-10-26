import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { CoachExplanation } from '@chefer/types';
import { CoachWhy } from '../../src/features/coach/coach-why';
import { PartlyLoggedRow } from '../../src/features/tracker/partly-logged-row';
import { renderWithTrpc, trpcError } from './friends-core-harness';

// Lane D2 (market review 2026-10): the "Partly logged day" switch and the
// review's "Why this suggestion" block.

jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/hooks/use-unit-system', () => ({ useUnitSystem: () => 'METRIC' }));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PartlyLoggedRow', () => {
  it('marks the day and reports it', async () => {
    const calls: unknown[] = [];
    await renderWithTrpc(<PartlyLoggedRow date="2026-10-20" incomplete={false} />, {
      'tracker.setDayIncomplete': (input) => {
        calls.push(input);
        return { date: '2026-10-20', incomplete: true };
      },
      'tracker.getDay': () => null,
    });
    expect(screen.getByText('Partly logged day')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('tracker-partly-logged-switch'), 'valueChange', true);
    await waitFor(() => expect(calls).toEqual([{ date: '2026-10-20', incomplete: true }]));
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('day_incomplete_set', { incomplete: true }),
    );
  });

  it('flips back and says so when the save fails', async () => {
    await renderWithTrpc(<PartlyLoggedRow date="2026-10-20" incomplete={false} />, {
      'tracker.setDayIncomplete': () => {
        throw trpcError('INTERNAL_SERVER_ERROR', 500);
      },
    });
    await fireEvent(screen.getByTestId('tracker-partly-logged-switch'), 'valueChange', true);
    expect(await screen.findByText("Couldn't save that. Try again in a moment.")).toBeOnTheScreen();
    expect(screen.getByTestId('tracker-partly-logged-switch')).toHaveProp('value', false);
  });
});

const EXPLANATION: CoachExplanation = {
  version: 1,
  reason: 'plateau',
  suggestedKcal: -100,
  goal: 'LOSE_WEIGHT',
  trend: {
    fromDate: '2026-09-28',
    toDate: '2026-10-18',
    fromKg: 82.4,
    toKg: 82.3,
    spanDays: 20,
    weighIns: 12,
    kgPerWeek: -0.03,
  },
  prevKgPerWeek: 0,
  intake: { avgKcal: 1850, completeDays: 5, incompleteDays: 1, targetKcal: 1900 },
};

describe('CoachWhy', () => {
  it('opens to the reasoning and the data used, and reports the view once', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<CoachWhy explanation={EXPLANATION} tier="premium" />, {});
    expect(screen.queryByTestId('coach-why-panel')).toBeNull();
    await user.press(screen.getByTestId('coach-why-toggle'));
    expect(screen.getByText(/1 partly logged day was left out/)).toBeOnTheScreen();
    expect(screen.getByText(/I'd suggest −100 kcal a day/)).toBeOnTheScreen();
    expect(screen.getByText('82.4 kg → 82.3 kg')).toBeOnTheScreen();
    expect(track).toHaveBeenCalledWith('coach_why_viewed', { tier: 'premium', reason: 'plateau' });
    await user.press(screen.getByTestId('coach-why-toggle'));
    expect(screen.queryByTestId('coach-why-panel')).toBeNull();
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('a free account sees the reasoning without the number', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <CoachWhy explanation={{ ...EXPLANATION, suggestedKcal: null }} tier="free" />,
      {},
    );
    await user.press(screen.getByTestId('coach-why-toggle'));
    expect(screen.getByText(/With Premium/)).toBeOnTheScreen();
    expect(screen.queryByText(/−100/)).toBeNull();
  });

  it('protein-only mode leaves the calorie lines out', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<CoachWhy explanation={EXPLANATION} tier="premium" proteinOnly />, {});
    await user.press(screen.getByTestId('coach-why-toggle'));
    expect(screen.queryByText(/kcal/)).toBeNull();
  });
});
