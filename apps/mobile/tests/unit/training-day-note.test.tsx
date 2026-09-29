import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { TrainingDayNutrition } from '@chefer/types';
import { TrainingDayNote } from '../../src/features/dashboard/components/training-day-note';
import { openPremium } from '../../src/features/premium/open-premium';

// T-06.5 — the Today training-day note: applied for free when the server flag
// is on, run kinds, the `Why?` Explain sheet, and the locked state.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const lift = (over: Partial<TrainingDayNutrition> = {}): TrainingDayNutrition => ({
  isTrainingDay: true,
  reason: 'SCHEDULED',
  workoutName: 'Upper A',
  kcalBonus: 250,
  proteinBonus: 32,
  applied: true,
  kind: 'lift',
  carbsBonus: 40,
  basis: { bodyweightKg: 80, proteinGPerKg: 1.8, trainingDayProteinGPerKg: 2.2 },
  ...over,
});

const renderNote = (
  t: TrainingDayNutrition,
  props: { restKcal?: number; restProteinG?: number } = {},
) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <TrainingDayNote t={t} {...props} />
    </SafeAreaProvider>,
  );

describe('TrainingDayNote', () => {
  it('renders nothing on a rest day', async () => {
    await renderNote(lift({ isTrainingDay: false }));
    expect(screen.queryByTestId('training-day')).toBeNull();
  });

  it('applied for a free user (flag on): line, second line and Why?, no upgrade lock', async () => {
    await renderNote(lift());
    expect(screen.getByTestId('training-day-line')).toHaveTextContent(
      'Training day · +250 kcal, +32 g protein',
    );
    expect(
      screen.getByText('Upper A today · protein at 2.2 g/kg, added to today'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('training-day-why')).toBeOnTheScreen();
    expect(screen.queryByTestId('training-day-upgrade')).toBeNull();
  });

  it('a run day says mostly carbs and never mentions protein per kilo', async () => {
    await renderNote(lift({ kind: 'run', workoutName: null, proteinBonus: 0, kcalBonus: 300 }));
    expect(screen.getByTestId('training-day-line')).toHaveTextContent(
      'Run day · +300 kcal, mostly carbs',
    );
    expect(screen.getByText('Mostly carbs, added to today')).toBeOnTheScreen();
    expect(screen.queryByText(/g\/kg/)).toBeNull();
  });

  it('Why? opens the Explain sheet with the rest-day row when the target is passed in', async () => {
    const user = userEvent.setup();
    await renderNote(lift(), { restKcal: 2300, restProteinG: 140 });
    await user.press(screen.getByTestId('training-day-why'));
    expect(await screen.findByText('More food on training days')).toBeOnTheScreen();
    expect(screen.getByText('Rest-day target')).toBeOnTheScreen();
    expect(screen.getByText('2,300 kcal · 140 g protein')).toBeOnTheScreen();
    expect(screen.getByText('Training bonus')).toBeOnTheScreen();
  });

  it('Why? works without the rest-day target (rows omitted)', async () => {
    const user = userEvent.setup();
    await renderNote(lift());
    await user.press(screen.getByTestId('training-day-why'));
    expect(await screen.findByText('More food on training days')).toBeOnTheScreen();
    expect(screen.queryByText('Rest-day target')).toBeNull();
  });

  it('locked (free, flag off): dashed preview, upgrade opens Premium, no Why?', async () => {
    const user = userEvent.setup();
    await renderNote(lift({ applied: false }));
    expect(screen.queryByTestId('training-day-why')).toBeNull();
    expect(screen.queryByText(/Upgrade from your Profile/)).toBeNull();
    await user.press(screen.getByTestId('training-day-upgrade'));
    expect(openPremium).toHaveBeenCalledWith('training-day');
  });
});
