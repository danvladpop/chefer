import { render, screen, userEvent } from '@testing-library/react-native';
import type { MuscleVolume, RoutineHint } from '@chefer/types';
import { hintKey } from '../../src/features/gym/routine/hints-storage';
import { WeeklyBalanceCard } from '../../src/features/gym/routine/weekly-balance';

// Weekly balance card (research §2.3): per-group volume bars plus dismissible
// hint rows. Dismissal is per rule/group/day/exercise (hintKey), and the
// dismiss action only appears when the caller opts in (Routine tab does;
// the live editor view doesn't, since there's nothing durable to dismiss yet).

const chestVolume: MuscleVolume = {
  group: 'chest',
  direct: 6,
  fractional: 6,
  days: 2,
  floor: 8,
  productiveMax: 20,
  warnAbove: 22,
};

const lowVolumeHint: RoutineHint = {
  rule: 'V1',
  level: 'info',
  group: 'chest',
  message: 'Chest: 6 sets/week. Most people need about 8–10 to keep growing.',
};

const sessionLengthHint: RoutineHint = {
  rule: 'V6',
  level: 'warning',
  dayIndex: 0,
  message: 'Leg day is about 105 min. Long sessions get skipped; consider splitting it.',
};

describe('WeeklyBalanceCard', () => {
  it('renders a volume row per muscle group', async () => {
    await render(<WeeklyBalanceCard testID="balance" volume={[chestVolume]} hints={[]} />);
    expect(screen.getByText('Chest')).toBeOnTheScreen();
    expect(screen.getByText(/6 sets\/wk · target 8–20/)).toBeOnTheScreen();
  });

  it('renders hint messages with a level badge', async () => {
    await render(
      <WeeklyBalanceCard
        testID="balance"
        volume={[chestVolume]}
        hints={[lowVolumeHint, sessionLengthHint]}
      />,
    );
    expect(screen.getByText(lowVolumeHint.message)).toBeOnTheScreen();
    expect(screen.getByText(sessionLengthHint.message)).toBeOnTheScreen();
  });

  it('hides hints already in dismissedKeys and shows a Dismiss action for the rest', async () => {
    const dismissed = new Set([hintKey(lowVolumeHint)]);
    await render(
      <WeeklyBalanceCard
        testID="balance"
        volume={[chestVolume]}
        hints={[lowVolumeHint, sessionLengthHint]}
        dismissedKeys={dismissed}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.queryByText(lowVolumeHint.message)).toBeNull();
    expect(screen.getByText(sessionLengthHint.message)).toBeOnTheScreen();
    expect(
      screen.getByTestId(`balance-hint-${hintKey(sessionLengthHint)}-dismiss`),
    ).toBeOnTheScreen();
  });

  it('calls onDismiss with the hint key when its Dismiss button is pressed', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    await render(
      <WeeklyBalanceCard
        testID="balance"
        volume={[chestVolume]}
        hints={[sessionLengthHint]}
        dismissedKeys={new Set()}
        onDismiss={onDismiss}
      />,
    );
    await user.press(screen.getByTestId(`balance-hint-${hintKey(sessionLengthHint)}-dismiss`));
    expect(onDismiss).toHaveBeenCalledWith(hintKey(sessionLengthHint));
  });

  it('shows every hint with no Dismiss action when dismissedKeys/onDismiss are omitted (editor)', async () => {
    await render(
      <WeeklyBalanceCard testID="balance" volume={[chestVolume]} hints={[lowVolumeHint]} />,
    );
    expect(screen.getByText(lowVolumeHint.message)).toBeOnTheScreen();
    expect(screen.queryByTestId(`balance-hint-${hintKey(lowVolumeHint)}-dismiss`)).toBeNull();
  });
});
