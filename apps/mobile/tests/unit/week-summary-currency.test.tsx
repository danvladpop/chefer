import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import { WeekSummarySheet } from '../../src/features/meal-plan/week-summary-sheet';

// openLegal (the AI consent sheet's Privacy link) pulls in expo-router.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Backlog P2-6: the week cost is a EUR estimate shown in the user's currency.
function renderSheet(
  currency?: 'EUR' | 'USD' | 'GBP' | 'RON',
  extra: { weekOffset?: number; shoppingFromDay?: number } = {},
) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <WeekSummarySheet
        visible
        weekLabel="22 – 28 Sep"
        badge="This week"
        days={[]}
        weekCostEur={40}
        {...extra}
        {...(currency && { currency })}
        isPast={false}
        isPremium
        leftovers={false}
        onToggleLeftovers={jest.fn()}
        regenerating={false}
        onRegenerate={jest.fn()}
        onMyWeeks={jest.fn()}
        onSelectDay={jest.fn()}
        onClose={jest.fn()}
      />
    </SafeAreaProvider>,
  );
}

describe('WeekSummarySheet cost chip', () => {
  it('stays in euros by default', async () => {
    await renderSheet();
    // UX-PLAN-07: a range, the week it is for, and the days it covers.
    expect(screen.getByText('≈ €34–€46 · this week · Mon–Sun')).toBeOnTheScreen();
  });

  it('converts to the user currency', async () => {
    await renderSheet('USD');
    expect(screen.getByText(/^≈ \$\d+–\$\d+ · this week · Mon–Sun$/)).toBeOnTheScreen();
  });

  it('says next week for next week and names a mid-week window (UX-PLAN-07)', async () => {
    await renderSheet(undefined, { weekOffset: 1, shoppingFromDay: 4 });
    expect(screen.getByText('≈ €34–€46 · next week · Fri–Sun')).toBeOnTheScreen();
    expect(screen.getByText('Share next week’s dinners')).toBeOnTheScreen();
  });
});
