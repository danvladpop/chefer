// Test support: Kitchen progress DTO fixtures and a tRPC mock for the
// `trpc.progress.*` hooks, so the strip, the host, the cook page and the
// settings card are tested against the real components and the shared copy.
import { vi } from 'vitest';
import {
  DEFAULT_PROGRESS_SETTINGS,
  type ProgressInbox,
  type ProgressSummary,
  type Receipt,
} from '@chefer/types';

export function summaryFixture(overrides: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    xp: { total: 1240, level: 7, xpIntoLevel: 340, xpForLevel: 500 },
    rank: { id: 'LINE_COOK', title: 'Line Cook', minLevel: 5 },
    nextRank: { id: 'CHEF_DE_PARTIE', title: 'Chef de Partie', minLevel: 10 },
    flame: {
      current: 6,
      best: 9,
      pilotLights: 2,
      pilotLightMax: 2,
      goal: 3,
      thisWeek: {
        weekStart: '2026-10-19',
        activeDays: 2,
        goal: 3,
        met: false,
        days: ['active', 'active', 'rest', 'today', 'future', 'future', 'future'],
      },
      pausedUntil: null,
      nextMilestone: 12,
      training: null,
    },
    todaysThree: {
      localDate: '2026-10-22',
      quests: [
        { id: 'LOG_SLOT:breakfast', kind: 'LOG_SLOT', xp: 10, mealType: 'breakfast', done: true },
        {
          id: 'COOK:dinner',
          kind: 'COOK',
          xp: 25,
          mealType: 'dinner',
          recipeId: 'r1',
          recipeName: 'Lemon Herb Salmon',
          done: false,
        },
        {
          id: 'PROTEIN',
          kind: 'PROTEIN',
          xp: 10,
          proteinTargetG: 140,
          done: false,
          progress: { current: 62, target: 140 },
        },
      ],
      bonusXp: 40,
      allDone: false,
    },
    settings: DEFAULT_PROGRESS_SETTINGS,
    quiet: false,
    intro: null,
    recap: null,
    ...overrides,
  };
}

export function receiptFixture(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 'rcpt-1',
    kind: 'COOK_FINISHED',
    sourceId: 'cook-1',
    localDate: '2026-10-22',
    xp: 35,
    lines: [
      { code: 'COOKED_AT_HOME', xp: 25 },
      { code: 'FIRST_TIME', xp: 10 },
    ],
    capped: false,
    meta: { cookCount: 37, mealType: 'dinner' },
    createdAt: new Date('2026-10-22T18:00:00Z'),
    ...overrides,
  };
}

export const EMPTY_INBOX: ProgressInbox = {
  receipts: [],
  unlocks: [],
  levelUp: null,
  cursor: null,
};

/**
 * Mutable state behind the mocked `trpc.progress` hooks. Tests set the fields,
 * the mock reads them on every render, and `calls` records what was sent.
 */
export const progressMock = {
  flags: { gamification: true } as Record<string, boolean>,
  availability: { enabled: true } as { enabled: boolean } | undefined,
  summary: summaryFixture() as ProgressSummary | undefined,
  inbox: EMPTY_INBOX as ProgressInbox | undefined,
  achievements: undefined as unknown,
  recap: undefined as unknown,
  receiptFor: null as Receipt | null,
  finishCookResult: undefined as unknown,
  /** Number of `useQuery` calls per procedure that were enabled. */
  queries: {} as Record<string, number>,
  mutate: {
    finishCook: vi.fn<[unknown], undefined>(),
    ack: vi.fn<[unknown], undefined>(),
    markSeen: vi.fn<[unknown], undefined>(),
    updateSettings: vi.fn<[unknown], undefined>(),
    setActiveDayGoal: vi.fn<[unknown], undefined>(),
    pauseFlame: vi.fn<[unknown], undefined>(),
    resumeFlame: vi.fn<[unknown], undefined>(),
  },
};

export function resetProgressMock(): void {
  progressMock.flags = { gamification: true };
  progressMock.availability = { enabled: true };
  progressMock.summary = summaryFixture();
  progressMock.inbox = EMPTY_INBOX;
  progressMock.achievements = undefined;
  progressMock.recap = undefined;
  progressMock.receiptFor = null;
  progressMock.finishCookResult = undefined;
  progressMock.queries = {};
  for (const fn of Object.values(progressMock.mutate)) fn.mockReset();
}

function query(name: string, data: () => unknown) {
  return {
    useQuery: (_input: unknown, opts?: { enabled?: boolean }) => {
      const enabled = opts?.enabled !== false;
      if (enabled) progressMock.queries[name] = (progressMock.queries[name] ?? 0) + 1;
      const value = enabled ? data() : undefined;
      return {
        data: value,
        isPending: enabled && value === undefined,
        isError: false,
        isLoading: false,
      };
    },
  };
}

function mutation(
  name: keyof typeof progressMock.mutate,
  result: () => unknown = () => ({ ok: true }),
) {
  return {
    useMutation: (opts?: { onSuccess?: (data: unknown, vars: unknown) => void }) => ({
      mutate: (input: unknown, callOpts?: { onSuccess?: () => void }) => {
        progressMock.mutate[name](input);
        opts?.onSuccess?.(result(), input);
        callOpts?.onSuccess?.();
      },
      isPending: false,
      isError: false,
      data: result(),
    }),
  };
}

const invalidate = vi.fn();
export const utilsInvalidate = invalidate;

/** The module shape for `vi.mock('@/lib/trpc', ...)`. */
export const progressTrpcMock = {
  trpc: {
    useUtils: () => ({
      progress: {
        summary: {
          invalidate,
          cancel: vi.fn(),
          getData: () => progressMock.summary,
          setData: vi.fn(),
        },
        inbox: { invalidate },
        receiptFor: { invalidate },
      },
    }),
    profile: {
      flags: { useQuery: () => ({ data: progressMock.flags, isPending: false }) },
    },
    progress: {
      availability: query('availability', () => progressMock.availability),
      summary: query('summary', () => progressMock.summary),
      inbox: query('inbox', () => progressMock.inbox),
      achievements: query('achievements', () => progressMock.achievements),
      weeklyRecap: query('weeklyRecap', () => progressMock.recap),
      receiptFor: query('receiptFor', () => progressMock.receiptFor ?? undefined),
      finishCook: mutation('finishCook', () => progressMock.finishCookResult),
      ack: mutation('ack'),
      markSeen: mutation('markSeen'),
      updateSettings: mutation('updateSettings'),
      setActiveDayGoal: mutation('setActiveDayGoal'),
      pauseFlame: mutation('pauseFlame'),
      resumeFlame: mutation('resumeFlame'),
    },
  },
};
