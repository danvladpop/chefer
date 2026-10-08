import { render, screen, userEvent } from '@testing-library/react-native';
import type { WeekGlanceDay } from '@chefer/types';
import { WeekGlance } from '../../src/features/dashboard/components/week-glance';
import { WeekOutlook } from '../../src/features/dashboard/components/week-outlook';

// T-06.5 — the `Your week` glance: exactly seven equal columns (never a
// scroll view, so Sunday cannot clip), training state as glyph shape, spoken
// labels, today highlighted.

// The meal dots are decorative (hidden from assistive tech on purpose).
const HIDDEN = { includeHiddenElements: true };

const days = (): WeekGlanceDay[] =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    meals: dayOfWeek === 6 ? 0 : 3,
    ...(dayOfWeek === 0 && {
      training: { kind: 'lift' as const, status: 'done' as const, workoutName: 'Upper A' },
    }),
    ...(dayOfWeek === 2 && {
      training: { kind: 'lift' as const, status: 'planned' as const, workoutName: 'Lower' },
    }),
    ...(dayOfWeek === 5 && {
      training: { kind: 'long_run' as const, status: 'planned' as const, workoutName: null },
    }),
  }));

describe('WeekGlance', () => {
  it('renders exactly 7 columns in a list, including Sunday, with no scroll view', async () => {
    await render(<WeekGlance days={days()} todayIdx={3} />);
    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`day-chip-${i}`)).toBeOnTheScreen();
    }
    expect(screen.getByText('Sun')).toBeOnTheScreen();
    expect(screen.getByTestId('week-glance-list').props.accessibilityRole).toBe('list');
    expect(screen.queryByTestId('week-glance-scroll')).toBeNull();
    expect(screen.getByText('Your week')).toBeOnTheScreen();
  });

  it('marks done sessions with a filled glyph and planned ones with an outline', async () => {
    await render(<WeekGlance days={days()} todayIdx={3} />);
    expect(screen.getByTestId('week-glance-glyph-0-done')).toBeOnTheScreen();
    expect(screen.getByTestId('week-glance-glyph-2-planned')).toBeOnTheScreen();
    expect(screen.getByTestId('week-glance-glyph-5-planned')).toBeOnTheScreen();
    expect(screen.queryByTestId('week-glance-glyph-1-planned')).toBeNull();
    expect(screen.queryByTestId('week-glance-glyph-1-done')).toBeNull();
  });

  it('speaks each column: weekday, meals and training state', async () => {
    await render(<WeekGlance days={days()} todayIdx={3} />);
    expect(screen.getByTestId('day-chip-0')).toHaveAccessibleName(
      'Monday: 3 meals, training day, done',
    );
    expect(screen.getByTestId('day-chip-2')).toHaveAccessibleName(
      'Wednesday: 3 meals, training day',
    );
    expect(screen.getByTestId('day-chip-1')).toHaveAccessibleName('Tuesday: 3 meals');
    expect(screen.getByTestId('day-chip-6')).toHaveAccessibleName('Sunday: 0 meals');
  });

  // R-21: the bare meal count under the weekday read like a broken date.
  it('shows the day-of-month under each weekday and the meals as dots, not a bare count', async () => {
    const thursday = new Date(2026, 8, 10, 12); // Thu 10 Sep 2026; week Mon 7 … Sun 13
    await render(<WeekGlance days={days()} todayIdx={3} now={thursday} />);
    ['7', '8', '9', '10', '11', '12', '13'].forEach((d) => {
      expect(screen.getByText(d)).toBeOnTheScreen();
    });
    // Three meals → three dots; an empty day → none.
    expect(screen.getByTestId('week-glance-meals-1', HIDDEN).children).toHaveLength(3);
    expect(screen.getByTestId('week-glance-meals-6', HIDDEN).children).toHaveLength(0);
    // The count is only in the spoken label — no bare "3" or "0" on screen.
    expect(screen.queryByText('3')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('caps the meal dots so seven columns keep fitting', async () => {
    const many = days().map((d) => (d.dayOfWeek === 1 ? { ...d, meals: 9 } : d));
    await render(<WeekGlance days={many} todayIdx={3} now={new Date(2026, 8, 10, 12)} />);
    expect(screen.getByTestId('week-glance-meals-1', HIDDEN).children).toHaveLength(4);
    expect(screen.getByTestId('day-chip-1')).toHaveAccessibleName('Tuesday: 9 meals');
  });

  it('wraps the day-of-month across a month boundary', async () => {
    // Wed 30 Sep 2026 → Mon 28 Sep … Sun 4 Oct.
    await render(<WeekGlance days={days()} todayIdx={2} now={new Date(2026, 8, 30, 12)} />);
    expect(screen.getByText('28')).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen();
    expect(screen.getByText('4')).toBeOnTheScreen();
  });

  it("keeps today's column visible and highlighted", async () => {
    await render(<WeekGlance days={days()} todayIdx={3} />);
    expect(screen.getByTestId('day-chip-3')).toBeVisible();
    expect(screen.getByTestId('day-chip-3').props.className ?? '').toContain('bg-primary');
    expect(screen.getByTestId('day-chip-4').props.className ?? '').not.toContain('bg-primary');
  });
});

describe('WeekOutlook with weekGlance', () => {
  const weekPlan = [
    {
      dayOfWeek: 0,
      meals: [
        {
          mealType: 'breakfast',
          recipeId: 'r1',
          recipeName: 'Overnight Oats',
          imageUrl: null,
          kcal: 420,
        },
      ],
    },
  ];

  it('shows the glance instead of the strip and keeps tap-to-expand', async () => {
    const user = userEvent.setup();
    await render(<WeekOutlook weekPlan={weekPlan} weekGlance={days()} />);
    expect(screen.getByTestId('week-glance')).toBeOnTheScreen();
    expect(screen.queryByText('Weekly Outlook')).toBeNull();
    await user.press(screen.getByTestId('day-chip-0'));
    expect(screen.getByText('Overnight Oats')).toBeOnTheScreen();
    await user.press(screen.getByTestId('day-chip-0'));
    expect(screen.queryByText('Overnight Oats')).toBeNull();
  });

  it('without weekGlance the current strip is unchanged', async () => {
    await render(<WeekOutlook weekPlan={weekPlan} />);
    expect(screen.queryByTestId('week-glance')).toBeNull();
    expect(screen.getByText('Weekly Outlook')).toBeOnTheScreen();
  });
});
