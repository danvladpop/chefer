import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PlanSettingsSheet } from '../../src/features/meal-plan/plan-settings-sheet';

// T-06.7: `Fit meals to my training days` in Plan settings — a working switch
// for Premium, a locked switch plus the PAT-3 taste link for free.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const wrap = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

jest.mock('expo-router', () => ({ Link: 'Link' }));
const mockOpenPremium = jest.fn<undefined, [string]>();
jest.mock('../../src/features/premium/open-premium', () => ({
  openPremium: (source: string) => {
    mockOpenPremium(source);
  },
}));
jest.mock('../../src/features/premium/premium-host', () => ({ PremiumHost: () => null }));

const shape = {
  slots: ['dinner'] as const,
  days: [0, 1, 2, 3],
  timeCapMins: 30 as const,
  weekendNoLimit: false,
  cookingFor: 2 as const,
  leftovers: false,
};
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    household: { list: { useQuery: () => ({ data: [] }) } },
    mealPlan: {
      getShape: { useQuery: () => ({ data: shape, isLoading: false }) },
      setShape: {
        useMutation: () => ({
          mutate: jest.fn(),
          isPending: false,
          isError: false,
          reset: jest.fn(),
        }),
      },
    },
  },
}));

const props = {
  visible: true,
  onClose: jest.fn(),
  hasPlan: true,
  weekLabel: 'this week',
  onSaved: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('Plan settings: fit meals to training days', () => {
  it('premium gets a working switch', async () => {
    const onChange = jest.fn();
    await wrap(<PlanSettingsSheet {...props} isPremium fitTraining={{ value: true, onChange }} />);
    const sw = screen.getByTestId('plan-settings-fit-training');
    expect(sw.props.value).toBe(true);
    await fireEvent(sw, 'valueChange', false);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('plan-settings-fit-training-premium')).toBeNull();
  });

  it('free sees it disabled with the taste link', async () => {
    await wrap(
      <PlanSettingsSheet
        {...props}
        isPremium={false}
        fitTraining={{ value: true, onChange: jest.fn() }}
      />,
    );
    expect(screen.getByTestId('plan-settings-fit-training').props.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('plan-settings-fit-training-premium'));
    expect(mockOpenPremium).toHaveBeenCalledWith('training-week');
    expect(screen.getByText('See what Premium adds')).toBeOnTheScreen();
  });

  it('is hidden when the user has no training days', async () => {
    await wrap(<PlanSettingsSheet {...props} isPremium />);
    expect(screen.queryByTestId('plan-settings-fit-training')).toBeNull();
  });
});
