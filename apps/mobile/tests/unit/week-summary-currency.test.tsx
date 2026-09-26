import { render, screen } from '@testing-library/react-native';
import { WeekSummarySheet } from '../../src/features/meal-plan/week-summary-sheet';

// Backlog P2-6: the week cost is a EUR estimate shown in the user's currency.
function renderSheet(currency?: 'EUR' | 'USD' | 'GBP' | 'RON') {
  return render(
    <WeekSummarySheet
      visible
      weekLabel="22 – 28 Sep"
      badge="This week"
      days={[]}
      weekCostEur={40}
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
    />,
  );
}

describe('WeekSummarySheet cost chip', () => {
  it('stays in euros by default', async () => {
    await renderSheet();
    expect(screen.getByText('≈ €40.00 this week')).toBeOnTheScreen();
  });

  it('converts to the user currency', async () => {
    await renderSheet('USD');
    expect(screen.getByText('≈ $43.20 this week')).toBeOnTheScreen();
  });
});
