// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISE_BY_ID, type TrainerRoutineDto } from '@chefer/types';
import { templateDto } from '../test-fixtures';
import { TuneWeightsStep } from './TuneWeightsStep';

const m = vi.hoisted(() => ({ setTarget: vi.fn(() => Promise.resolve({})) }));

vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
vi.mock('@/lib/trpc', () => {
  const library = [...EXERCISE_BY_ID.values()].map((e) => ({ ...e, ownerId: null, images: [] }));
  return {
    trpc: {
      gym: {
        profile: { get: { useQuery: () => ({ data: { unit: 'KG' } }) } },
        library: { list: { useQuery: () => ({ data: library }) } },
      },
      trainer: {
        client: {
          routine: {
            useQuery: (input: { clientId: string }) => ({
              data: routine(input.clientId),
              isLoading: false,
            }),
          },
          setNextTarget: { useMutation: () => ({ mutateAsync: m.setTarget }) },
        },
      },
    },
  };
});

function routine(clientId: string): TrainerRoutineDto {
  const suggestion = {
    kind: 'hold' as const,
    weightKg: clientId === 'c1' ? 60 : 40,
    reps: [8, 8, 8],
    sets: 3,
    reasonCode: 'CONSOLIDATE' as const,
    inputs: {},
    deltaKg: 0,
    engineVersion: 1,
  };
  return {
    id: 'r',
    name: 'Routine',
    templateKey: null,
    version: 2,
    nextDayId: null,
    updatedAt: '2026-10-01T10:00:00.000Z',
    lastEditedByOther: null,
    exercises: [],
    days: [
      {
        id: `${clientId}-new`,
        position: 0,
        name: 'Lower body A',
        plannedWeekday: null,
        exercises: [
          {
            id: `${clientId}-r1`,
            exerciseId: 'back-squat',
            position: 0,
            sets: 3,
            repMin: 6,
            repMax: 8,
            targetRir: 2,
            restSec: 120,
            supersetGroup: null,
            trainerNote: null,
            lastEditedByOther: null,
            next: {
              repBucket: '6-8',
              suggestion,
              override: null,
              lastDoneDate: clientId === 'c1' ? '2026-10-08' : null,
            },
          },
        ],
      },
    ],
  };
}

afterEach(cleanup);

describe('TuneWeightsStep', () => {
  it('steps through clients, saving only changed weights as next-session targets', async () => {
    const onDone = vi.fn();
    render(
      <TuneWeightsStep
        template={templateDto()}
        clients={[
          { clientId: 'c1', name: 'Maria Pop', routineDayId: 'c1-new' },
          { clientId: 'c2', name: 'Ion Rus', routineDayId: 'c2-new' },
        ]}
        onDone={onDone}
      />,
    );
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    const row = screen.getByTestId('tune-row');
    expect(row).toHaveTextContent('Back Squat');
    expect(row).toHaveTextContent('Template 60 kg');
    const weight = screen.getByLabelText(/^Weight \(kg\)/);
    expect(weight).toHaveValue('60');
    fireEvent.change(weight, { target: { value: '62.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next client' }));
    await waitFor(() => expect(screen.getByText('2 of 2')).toBeInTheDocument());
    expect(m.setTarget).toHaveBeenCalledTimes(1);
    expect(m.setTarget).toHaveBeenCalledWith({
      clientId: 'c1',
      exerciseId: 'back-squat',
      repBucket: '6-8',
      weightKg: 62.5,
      reps: [8, 8, 8],
    });

    // Ion has no history; unchanged → nothing saved.
    expect(screen.getByTestId('tune-row')).toHaveTextContent('No history yet');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(m.setTarget).toHaveBeenCalledTimes(1);
  });
});
