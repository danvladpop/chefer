import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import { DENSE_MAX_FONT_SCALE } from '@chefer/ui-mobile';
import { WeekSummarySheet } from '../../src/features/meal-plan/week-summary-sheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// T-21.13 (bug CI-43): the 3-letter day labels must never wrap or overflow
// their fixed-width column at large accessibility text sizes.
describe('WeekSummarySheet day labels (T-21.13, CI-43)', () => {
  it('caps the day label at DENSE_MAX_FONT_SCALE', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <WeekSummarySheet
          visible
          weekLabel="22 – 28 Sep"
          badge="This week"
          days={[
            { label: 'MON', dayIndex: 0, mealsCount: 3, totalKcal: 1800, isToday: true },
            { label: 'TUE', dayIndex: 1, mealsCount: 0, totalKcal: 0, isToday: false },
          ]}
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
        />
      </SafeAreaProvider>,
    );

    const monday = screen.getByText('MON');
    expect(monday.props.maxFontSizeMultiplier).toBe(DENSE_MAX_FONT_SCALE);
    const tuesday = screen.getByText('TUE');
    expect(tuesday.props.maxFontSizeMultiplier).toBe(DENSE_MAX_FONT_SCALE);
  });
});
