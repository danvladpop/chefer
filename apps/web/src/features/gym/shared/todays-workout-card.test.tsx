// @vitest-environment jsdom
import { I18nProvider } from '@/lib/i18n';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFormatLocale } from '@chefer/utils';
import { TodaysWorkoutCard } from './todays-workout-card';

// Lane J phase 4: the Food Today "Today's workout" card follows the UI language
// (`gym.todaysWorkout.*`), with the Romanian plurals for PRs and exercises.

const TODAY = '2026-11-04';

const mocks = vi.hoisted(() => {
  const state: { data: unknown; prs: { localDate: string }[] } = { data: null, prs: [] };
  return state;
});

vi.mock('./use-gym-data', () => ({
  useGymData: () => ({ data: mocks.data, today: TODAY, ready: true }),
}));
vi.mock('./week-ring', () => ({ WeekRing: () => <span data-testid="week-ring" /> }));
vi.mock('@/features/nav/mode-context', () => ({ useAppMode: () => ({ switchMode: vi.fn() }) }));
vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  selectTodaysSession: () => ({ kind: 'none' }),
  collectPrs: () => mocks.prs,
}));

const NEXT = { dayId: 'day-a', dayName: 'Upper A', estimatedMin: 45, exercises: [1, 2, 3, 4, 5] };

function bootstrap(overrides: Record<string, unknown> = {}) {
  return {
    profile: { setupCompletedAt: null },
    recentSessions: [],
    nextWorkout: NEXT,
    activeRoutine: null,
    streak: { thisWeekSessions: 1, thisWeekGoal: 3 },
    ...overrides,
  };
}

function renderRo() {
  return render(
    <I18nProvider initialChoice="ro" deviceTags={['ro-RO']}>
      <TodaysWorkoutCard />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  setFormatLocale(null);
  mocks.prs = [];
});

describe('TodaysWorkoutCard — Romanian (lane J)', () => {
  it('invites setup when there is no gym profile', () => {
    mocks.data = bootstrap({ profile: null });
    renderRo();
    expect(screen.getByText('Antrenamentul de azi')).toBeTruthy();
    expect(screen.getByText('Începe antrenamentul de forță')).toBeTruthy();
    expect(screen.getByText('O configurare de 90 de secunde îți alege un program.')).toBeTruthy();
  });

  it('names the next day with the exercise plural and the estimate', () => {
    mocks.data = bootstrap();
    renderRo();
    expect(screen.getByText('Upper A')).toBeTruthy();
    expect(screen.getByText('5 exerciții · ~45 min')).toBeTruthy();
  });

  it('counts today’s PRs with the Romanian plural once done', () => {
    mocks.data = bootstrap({
      recentSessions: [{ status: 'COMPLETED', localDate: TODAY }],
    });
    mocks.prs = [{ localDate: TODAY }, { localDate: TODAY }];
    renderRo();
    expect(screen.getByText('Gata ✓ · 2 recorduri')).toBeTruthy();
    expect(screen.getByText('Urmează: Upper A')).toBeTruthy();
  });
});
