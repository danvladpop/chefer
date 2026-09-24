import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '@chefer/api';
import type { ExerciseDto, GymBootstrap, Suggestion, WorkoutSessionDoc } from '@chefer/types';
import { trpc } from '../../src/lib/trpc';
import { makeDoc, makeExercise, uuid } from './gym-fixtures';

// Shared fixtures for the G2-A workout/summary RNTL tests. (Not a test file:
// jest.mock calls stay in each *.test.tsx because they are hoisted per file.)

export const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export const SE_ID = uuid(50);
export const WARMUP_ID = uuid(60);
export const SET_IDS = [uuid(61), uuid(62), uuid(63)] as const;

export function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    kind: 'start',
    weightKg: 60,
    reps: [10, 10, 10],
    sets: 3,
    reasonCode: 'START',
    inputs: { repMin: 8, repMax: 12, loadType: 'WEIGHTED', equipment: 'BARBELL' },
    deltaKg: 0,
    engineVersion: 1,
    ...overrides,
  };
}

/** One in-progress session: `exerciseId` with 1 warm-up (30 × 8) + 3 × 60 kg × 10. */
export function activeDoc(
  opts: { exerciseId?: string; prescription?: Suggestion } = {},
): WorkoutSessionDoc {
  return makeDoc(7, {
    name: 'Upper A',
    status: 'IN_PROGRESS',
    finishedAt: null,
    startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    exercises: [
      {
        id: SE_ID,
        exerciseId: opts.exerciseId ?? 'bench',
        routineExerciseId: null,
        position: 0,
        repMin: 8,
        repMax: 12,
        targetRir: 2,
        restSec: 120,
        skipped: false,
        swappedFromId: null,
        lastSetRir: null,
        notes: null,
        prescription: opts.prescription ?? suggestion(),
        sets: [
          { id: WARMUP_ID, position: 0, weightKg: 30, reps: 8, isWarmup: true, completedAt: null },
          ...SET_IDS.map((id, i) => ({
            id,
            position: i + 1,
            weightKg: 60,
            reps: 10,
            isWarmup: false,
            completedAt: null,
          })),
        ],
      },
    ],
  });
}

export function machine(id = 'chest-press'): ExerciseDto {
  return { ...makeExercise(id, 'Chest Press'), equipment: 'MACHINE' };
}

export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: Infinity } },
  });
}

export type LinkCall = { path: string; input: unknown };

/** A terminating tRPC link that records calls and answers from `respond`. */
export function recordingLink(
  calls: LinkCall[],
  respond: (path: string, input: unknown) => unknown,
): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        calls.push({ path: op.path, input: op.input });
        observer.next({ result: { type: 'data', data: respond(op.path, op.input) } });
        observer.complete();
      });
}

export function Providers({
  queryClient,
  bootstrap,
  children,
  link,
}: {
  queryClient: QueryClient;
  bootstrap?: GymBootstrap;
  children: React.ReactNode;
  link?: TRPCLink<AppRouter>;
}) {
  const client = trpc.createClient({
    links: [link ?? recordingLink([], () => bootstrap ?? null)],
  });
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <trpc.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    </SafeAreaProvider>
  );
}
