// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { outbox } from '@/features/gym/workout/outbox';
import { resetGymOwnerForTests, setGymOwner } from '@/features/gym/workout/owner';
import { resetSessionCorrectionsForTests } from '@/features/gym/workout/session-corrections';
import { createMemoryStorage, setStorageForTests } from '@/features/gym/workout/storage';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXERCISE_BY_ID, type ExerciseDto, type WorkoutSessionDoc } from '@chefer/types';
import GymHistoryDetailPage from './page';

// T-42.5 (cardio renders in history) and T-44.5 (Delete workout + Undo) on the
// web session detail.

const ID = '00000000-0000-4000-8000-0000000000f1';

const m = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  toasts: [] as { message: string; actionLabel?: string; onAction?: () => void }[],
  doc: undefined as WorkoutSessionDoc | undefined,
  library: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '00000000-0000-4000-8000-0000000000f1' }),
  useRouter: () => ({ back: m.back, push: m.push }),
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
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    gym: { session: { get: { useQuery: () => ({ data: m.doc, isLoading: false, error: null }) } } },
    useUtils: () => ({
      gym: {
        bootstrap: {
          cancel: () => Promise.resolve(),
          setData: vi.fn(),
          invalidate: () => Promise.resolve(),
        },
      },
    }),
  },
}));
vi.mock('@/features/gym/use-gym-bootstrap', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/gym/use-gym-bootstrap')>();
  return {
    ...original,
    useGymBootstrap: () => ({
      data: {
        profile: { unit: 'KG', distanceUnit: null },
        library: m.library,
        recentSessions: [],
        weeks: [],
        streak: { current: 0, best: 0, flexTokens: 0, thisWeekSessions: 0, thisWeekGoal: 3 },
        engineVersion: 1,
      },
    }),
  };
});
vi.mock('@/features/gym/shared/gym-toast', () => ({
  showGymToast: (t: { message: string; actionLabel?: string; onAction?: () => void }) => {
    m.toasts.push(t);
  },
}));

function exercise(id: string): ExerciseDto {
  const meta = EXERCISE_BY_ID.get(id);
  if (!meta) throw new Error(`catalogue has no ${id}`);
  return {
    ...meta,
    ownerId: null,
    archived: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as unknown as ExerciseDto;
}

function mixedDoc(): WorkoutSessionDoc {
  const at = '2026-09-22T18:00:00.000Z';
  const base = {
    routineExerciseId: null,
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    restSec: 120,
    skipped: false,
    swappedFromId: null,
    notes: null,
    prescription: {
      kind: 'hold',
      weightKg: 60,
      reps: [8],
      sets: 1,
      reasonCode: 'ADD_REPS',
      inputs: {},
      deltaKg: 0,
      engineVersion: 1,
    },
  };
  return {
    schemaVersion: 1,
    id: ID,
    routineId: null,
    routineDayId: null,
    name: 'Bench + run',
    status: 'COMPLETED',
    startedAt: at,
    finishedAt: '2026-09-22T18:45:00.000Z',
    localDate: '2026-09-22',
    isDeload: false,
    notes: null,
    clientUpdatedAt: '2026-09-22T18:45:00.000Z',
    engineVersion: 1,
    exercises: [
      {
        ...base,
        id: 'se-bench',
        exerciseId: 'barbell-bench-press',
        position: 0,
        lastSetRir: 2,
        sets: [{ id: 'b1', position: 0, weightKg: 60, reps: 8, isWarmup: false, completedAt: at }],
      },
      {
        ...base,
        id: 'se-run',
        exerciseId: 'outdoor-run',
        position: 1,
        lastSetRir: null,
        sets: [
          {
            id: 'r1',
            position: 0,
            weightKg: 0,
            reps: 0,
            isWarmup: false,
            completedAt: at,
            durationSec: 1200,
            distanceM: 5000,
            intensityRpe: 5,
          },
        ],
      },
    ],
  } as WorkoutSessionDoc;
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  setStorageForTests(createMemoryStorage());
  resetGymOwnerForTests();
  setGymOwner('user-a');
  outbox.reload();
  outbox.configure(null);
  resetSessionCorrectionsForTests();
  m.toasts.length = 0;
  m.push.mockClear();
  m.doc = mixedDoc();
  m.library = [exercise('barbell-bench-press'), exercise('outdoor-run')];
});
afterEach(() => {
  cleanup();
  setStorageForTests(null);
});

describe('GymHistoryDetailPage', () => {
  it('T-42.5: a cardio exercise reads time · distance · effort, never "0 kg × 0"', () => {
    render(<GymHistoryDetailPage />);
    expect(screen.getByText('60 kg × 8')).toBeInTheDocument();
    expect(screen.getByTestId('gym-history-cardio')).toHaveTextContent('20 min · 5 km · Moderate');
    expect(screen.queryByText(/0 kg × 0/)).toBeNull();
  });

  it('T-44.5: ⋯ → Delete workout confirms by name, holds it, and Undo sends nothing', async () => {
    const send = vi.fn(() => Promise.resolve([]));
    outbox.configure({ send });
    render(<GymHistoryDetailPage />);

    fireEvent.click(screen.getByTestId('gym-history-options'));
    fireEvent.click(screen.getByTestId('gym-history-options-delete'));
    const body = await screen.findByTestId('gym-delete-body');
    expect(body).toHaveTextContent(/Bench \+ run on .*: 2 sets\./);
    expect(screen.queryByText(/window\.confirm/)).toBeNull();

    fireEvent.click(screen.getByTestId('gym-delete-confirm'));
    await waitFor(() => expect(m.toasts.at(-1)?.message).toBe('Workout deleted'));
    expect(m.push).toHaveBeenCalledWith('/gym');
    expect(outbox.getState().entries.map((e) => e.doc.status)).toEqual(['DISCARDED']);

    m.toasts.at(-1)?.onAction?.();
    expect(outbox.getState().entries).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('Edit workout is shown as phone-only for now (reverse ledger row)', () => {
    render(<GymHistoryDetailPage />);
    fireEvent.click(screen.getByTestId('gym-history-options'));
    expect(screen.getByRole('menuitem', { name: /Edit workout/ })).toBeDisabled();
  });
});
