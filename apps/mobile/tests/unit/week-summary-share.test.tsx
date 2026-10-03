import { Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { weekdayShortName } from '@chefer/utils';
import { WeekSummarySheet } from '../../src/features/meal-plan/week-summary-sheet';

// openLegal (the AI consent sheet's Privacy link) pulls in expo-router.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// T-13.2 (Plan half) + T-06.4: the week summary shares the dinners as plain
// text and marks training days.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mockShow = jest.fn();
jest.mock('@chefer/ui-mobile', () => ({
  ...jest.requireActual<object>('@chefer/ui-mobile'),
  useSnackbar: () => ({ show: mockShow }),
}));

function renderSheet(
  extra: Partial<React.ComponentProps<typeof WeekSummarySheet>> = {},
  days: React.ComponentProps<typeof WeekSummarySheet>['days'] = [],
) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <WeekSummarySheet
        visible
        weekLabel="22 – 28 Sep"
        badge="This week"
        days={days}
        weekCostEur={null}
        isPast={false}
        isPremium={false}
        leftovers={false}
        onToggleLeftovers={jest.fn()}
        regenerating={false}
        onRegenerate={jest.fn()}
        onMyWeeks={jest.fn()}
        onSelectDay={jest.fn()}
        onClose={jest.fn()}
        {...extra}
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('WeekSummarySheet dinners share', () => {
  it('is disabled when there are no planned dinners', async () => {
    const share = jest.spyOn(Share, 'share');
    await renderSheet({ dinners: [] });
    const button = screen.getByTestId('week-summary-share-dinners');
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(share).not.toHaveBeenCalled();
  });

  it('shares plain text and confirms with the snackbar', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    await renderSheet({ dinners: [{ dayLabel: 'Mon', recipeName: 'Chicken Stir-fry' }] });
    await fireEvent.press(screen.getByTestId('week-summary-share-dinners'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const { message } = share.mock.calls[0]?.[0] as { message: string };
    expect(message).toContain('Mon: Chicken Stir-fry');
    expect(message).toContain('Made with Chefer');
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'List ready to send.' }),
      ),
    );
  });

  it('does not confirm when the share sheet was dismissed', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
    await renderSheet({ dinners: [{ dayLabel: 'Mon', recipeName: 'Chicken Stir-fry' }] });
    await fireEvent.press(screen.getByTestId('week-summary-share-dinners'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(mockShow).not.toHaveBeenCalled();
  });
});

describe('WeekSummarySheet training days', () => {
  it('shows the count chip and the workout name on training days only', async () => {
    const row = (
      dayIndex: number,
      training?: { kind: 'lift' | 'run'; workoutName: string | null },
    ) => ({
      label: weekdayShortName(dayIndex),
      dayIndex,
      mealsCount: 3,
      totalKcal: 2000,
      isToday: false,
      training,
    });
    await renderSheet({}, [
      row(0, { kind: 'lift', workoutName: 'Upper A' }),
      row(1),
      row(2, { kind: 'run', workoutName: null }),
    ]);
    expect(screen.getByTestId('week-summary-training-chip')).toHaveTextContent('2 training days');
    expect(screen.getByTestId('week-summary-training-0')).toHaveTextContent(/Upper A/);
    expect(screen.queryByTestId('week-summary-training-1')).toBeNull();
    expect(screen.getByTestId('week-summary-training-2')).toBeOnTheScreen();
  });
});
