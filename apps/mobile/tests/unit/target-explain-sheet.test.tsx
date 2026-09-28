import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { TargetsView } from '@chefer/types';
import { TargetExplainSheet } from '../../src/features/nutrition/target-explain-sheet';

// UX-11 AC3: tapping the ring/macro/day-totals opens this sheet.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => void mockPush(...a) },
}));

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

const SUGGESTED_VIEW: TargetsView = {
  effective: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  suggested: { dailyCalorieTarget: 2200, proteinG: 150, carbsG: 220, fatG: 70 },
  source: 'suggested' as const,
  inputs: {
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activity: 'MODERATELY_ACTIVE',
    goal: 'MAINTAIN',
    isLifter: false,
    proteinGPerKg: null,
    usedAdjustedWeight: false,
    rate: 'Maintenance calories',
  },
};

const OWN_VIEW: TargetsView = { ...SUGGESTED_VIEW, source: 'own' };

function renderSheet(view: TargetsView | undefined, onClose = jest.fn()) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <TargetExplainSheet visible onClose={onClose} view={view} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('TargetExplainSheet', () => {
  it('shows the resolved numbers and the formula sentence for a suggested target', async () => {
    await renderSheet(SUGGESTED_VIEW);
    expect(screen.getByText('2,200 kcal')).toBeTruthy();
    expect(screen.getByText('150 g')).toBeTruthy();
    expect(screen.getByText(/Mifflin–St Jeor/)).toBeTruthy();
    expect(screen.getByText('Set your own target')).toBeTruthy();
  });

  it('shows "you set this" for an own target, with the reverse action', async () => {
    await renderSheet(OWN_VIEW);
    expect(screen.getByText('You set this target yourself.')).toBeTruthy();
    expect(screen.getByText('Use the suggested target')).toBeTruthy();
  });

  it('renders no numbers while the view is still loading', async () => {
    await renderSheet(undefined);
    expect(screen.queryByText('2,200 kcal')).toBeNull();
  });

  it('the action button closes the sheet and navigates to preferences', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await renderSheet(SUGGESTED_VIEW, onClose);

    await user.press(screen.getByText('Set your own target'));

    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/preferences');
  });
});
