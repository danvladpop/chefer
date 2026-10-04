// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { addDaysLocal, weekStartOf } from '@chefer/utils';
import { RecentWorkouts } from '../today/RecentWorkouts';
import { localDate } from '../use-gym-bootstrap';
import { outbox } from '../workout/outbox';
import { resetGymOwnerForTests, setGymOwner } from '../workout/owner';
import { resetSessionCorrectionsForTests } from '../workout/session-corrections';
import { createMemoryStorage, setStorageForTests } from '../workout/storage';

// T-36.A2.2 (Recent, grouped, Show more) and T-44.5 (Delete + Undo) on the web.

const m = vi.hoisted(() => ({
  fetchList: vi.fn(),
  setData: vi.fn(),
  toasts: [] as { message: string; actionLabel?: string; onAction?: () => void }[],
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      gym: {
        bootstrap: {
          cancel: () => Promise.resolve(),
          setData: m.setData,
          invalidate: () => Promise.resolve(),
        },
        session: { list: { fetch: m.fetchList } },
      },
    }),
  },
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('../shared/gym-toast', () => ({
  showGymToast: (t: { message: string; actionLabel?: string; onAction?: () => void }) => {
    m.toasts.push(t);
  },
}));

const TODAY = localDate();
const YESTERDAY = addDaysLocal(TODAY, -1);

function session(id: string, over: Partial<SessionSummaryDto> = {}): SessionSummaryDto {
  return {
    id,
    name: 'Full Body A',
    routineDayId: null,
    status: 'COMPLETED',
    localDate: TODAY,
    startedAt: `${TODAY}T18:10:00.000Z`,
    finishedAt: `${TODAY}T18:52:00.000Z`,
    isDeload: false,
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: 2,
        sets: [{ weightKg: 60, reps: 10, isWarmup: false, completed: true }],
      },
    ],
    ...over,
  };
}

function bootstrap(sessions: SessionSummaryDto[]): GymBootstrap {
  return {
    recentSessions: sessions,
    weeks: [{ weekStart: weekStartOf(TODAY), goal: 2, sessions: 2, status: 'met', flexTokens: 0 }],
    streak: { current: 1, best: 1, flexTokens: 0, thisWeekSessions: 2, thisWeekGoal: 2 },
    progressions: [],
    engineVersion: 1,
  } as unknown as GymBootstrap;
}

const ids = ['00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2'];

beforeEach(() => {
  // jsdom doesn't implement it; the Sheet's scroll lock calls it on unmount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  setStorageForTests(createMemoryStorage());
  resetGymOwnerForTests();
  setGymOwner('user-a');
  outbox.reload();
  outbox.configure(null);
  resetSessionCorrectionsForTests();
  m.toasts.length = 0;
  m.fetchList.mockReset();
  m.setData.mockReset();
});
afterEach(() => {
  cleanup();
  setStorageForTests(null);
});

describe('RecentWorkouts (web)', () => {
  it('groups under day headers, shows start times only for a same-day pair, 3 rows by default', () => {
    const sessions = [
      session('s1', { startedAt: `${TODAY}T18:10:00` /* local wall clock */ }),
      session('s2', { name: 'Evening ride', startedAt: `${TODAY}T07:30:00` }),
      session('s3', { localDate: YESTERDAY, startedAt: `${YESTERDAY}T18:00:00.000Z` }),
      session('s4', { localDate: YESTERDAY, startedAt: `${YESTERDAY}T06:00:00.000Z` }),
    ];
    render(<RecentWorkouts data={bootstrap(sessions)} today={TODAY} />);
    expect(screen.getByTestId(`gym-recent-heading-${TODAY}`)).toHaveTextContent('Today');
    expect(screen.getByTestId(`gym-recent-heading-${YESTERDAY}`)).toHaveTextContent('Yesterday');
    expect(screen.getByTestId('gym-recent-row-s1')).toHaveTextContent(/18:10/);
    expect(screen.getByTestId('gym-recent-row-s3')).not.toHaveTextContent(/18:00/);
    expect(screen.queryByTestId('gym-recent-row-s4')).toBeNull();
    // No ISO date anywhere on the list.
    expect(screen.queryByText(TODAY)).toBeNull();
  });

  // WP-20: a quick-logged activity reads "45 min · ~400 kcal", never "1 sets".
  it('shows an activity row as minutes and kcal instead of a set count', () => {
    const activity = session('act1', {
      name: 'Cycling class',
      startedAt: `${TODAY}T17:00:00.000Z`,
      finishedAt: `${TODAY}T17:45:00.000Z`,
      exercises: [
        {
          exerciseId: 'spin-class',
          skipped: false,
          lastSetRir: null,
          sets: [
            {
              weightKg: 0,
              reps: 0,
              isWarmup: false,
              completed: true,
              durationSec: 2700,
              caloriesKcal: 400,
            },
          ],
        },
      ],
    });
    render(<RecentWorkouts data={bootstrap([activity])} today={TODAY} />);
    const row = screen.getByTestId('gym-recent-row-act1');
    expect(row).toHaveTextContent('45 min · ~400 kcal');
    expect(row).not.toHaveTextContent(/sets/);
    expect(
      screen.getByRole('link', { name: /45 minutes, about 400 kilocalories/ }),
    ).toBeInTheDocument();
  });

  it('Show more adds 5 from the cache, then pages the cursor online', async () => {
    const sessions = Array.from({ length: 4 }, (_, i) =>
      session(`c${i}`, { startedAt: `${TODAY}T0${i}:00:00.000Z` }),
    );
    m.fetchList.mockResolvedValueOnce({
      items: [session('online-1', { localDate: addDaysLocal(TODAY, -40) })],
      nextCursor: null,
    });
    render(<RecentWorkouts data={bootstrap(sessions)} today={TODAY} />);
    fireEvent.click(screen.getByTestId('gym-recent-show-more'));
    expect(screen.getByTestId('gym-recent-row-c3')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('gym-recent-show-more'));
    await waitFor(() => expect(screen.getByTestId('gym-recent-row-online-1')).toBeInTheDocument());
    expect(m.fetchList).toHaveBeenCalledTimes(1);
  });

  it('is hidden with no completed sessions', () => {
    render(<RecentWorkouts data={bootstrap([])} today={TODAY} />);
    expect(screen.queryByTestId('gym-recent')).toBeNull();
  });

  it('⋯ → Delete workout names the workout, then Undo within 8 s sends nothing (AC4)', async () => {
    const send = vi.fn((docs: { id: string }[]) =>
      Promise.resolve(docs.map((d) => ({ id: d.id, status: 'applied' as const }))),
    );
    outbox.configure({ send });
    render(
      <RecentWorkouts
        data={bootstrap([session(ids[0] ?? 'x'), session(ids[1] ?? 'y', { name: 'Push' })])}
        today={TODAY}
      />,
    );
    fireEvent.click(screen.getByTestId(`gym-recent-options-${ids[0]}`));
    fireEvent.click(screen.getByTestId(`gym-recent-options-${ids[0]}-delete`));

    const body = await screen.findByTestId('gym-delete-body');
    expect(body).toHaveTextContent(/Full Body A on .*: 1 set\./);
    expect(body).toHaveTextContent('This week goes from 2 to 1 session.');
    expect(body).toHaveTextContent('Your streak goes from 1 week to 0.');

    fireEvent.click(screen.getByTestId('gym-delete-confirm'));
    await waitFor(() => expect(m.toasts.at(-1)?.message).toBe('Workout deleted'));
    expect(outbox.getState().entries.map((e) => e.doc.status)).toEqual(['DISCARDED']);
    expect(m.setData).toHaveBeenCalled();

    m.toasts.at(-1)?.onAction?.();
    expect(outbox.getState().entries).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });
});
