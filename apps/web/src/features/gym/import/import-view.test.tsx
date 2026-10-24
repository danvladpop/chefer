// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutImportPreviewDto } from '@chefer/types';
import { ImportView } from './import-view';

// G2: /gym/import — file → (kg or lb?) → review → import → done.

const mockPreview = vi.hoisted(() => vi.fn());
const mockCommit = vi.hoisted(() =>
  vi.fn((_input: { mappings: unknown[]; timeZone: string }): Promise<unknown> => Promise.resolve()),
);
const mockInvalidate = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockCapture = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics', () => ({ capture: mockCapture }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('../shared/use-gym-data', () => ({ useGymData: () => ({ data: { library: [] } }) }));
vi.mock('../shared/exercise-picker-sheet', () => ({ ExercisePickerSheet: () => null }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ gym: { invalidate: mockInvalidate } }),
    gym: {
      import: {
        preview: { useMutation: () => ({ mutateAsync: mockPreview, isPending: false }) },
        commit: { useMutation: () => ({ mutateAsync: mockCommit, isPending: false }) },
      },
    },
  },
}));

const READY: WorkoutImportPreviewDto = {
  status: 'ready',
  source: 'STRONG',
  weightUnit: 'KG',
  workouts: 3,
  sets: 40,
  firstDate: '2025-01-05',
  lastDate: '2025-03-01',
  alreadyImported: 1,
  exercises: [
    {
      name: 'Squat (Barbell)',
      sets: 20,
      workouts: 3,
      kind: 'strength',
      status: 'matched',
      exerciseId: 'back-squat',
      exerciseName: 'Back Squat',
      alternatives: [],
      suggestedMuscle: 'quads',
    },
    {
      name: 'Hand Gripper',
      sets: 12,
      workouts: 2,
      kind: 'strength',
      status: 'unmatched',
      exerciseId: null,
      exerciseName: null,
      alternatives: [{ id: 'barbell-wrist-curl', name: 'Barbell Wrist Curl' }],
      suggestedMuscle: 'forearms',
    },
    {
      name: 'Decline Chest Press (Machine)',
      sets: 8,
      workouts: 1,
      kind: 'strength',
      status: 'suggested',
      exerciseId: 'machine-chest-press',
      exerciseName: 'Machine Chest Press',
      alternatives: [],
      suggestedMuscle: 'chest',
    },
  ],
};

function upload(text = 'Date;Exercise Name;Set Order\n') {
  const input = screen.getByTestId('gym-import-file');
  const file = new File([text], 'strong.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  mockPreview.mockReset().mockResolvedValue(READY);
  mockCommit.mockReset().mockResolvedValue({
    source: 'STRONG',
    imported: 2,
    alreadyImported: 1,
    skippedWorkouts: 0,
    createdExercises: 1,
    trimmedSets: 0,
    firstDate: '2025-01-05',
    lastDate: '2025-03-01',
  });
  mockCapture.mockReset();
});
afterEach(cleanup);

describe('ImportView', () => {
  it('explains where to find the export in each app', () => {
    render(<ImportView />);
    expect(screen.getByRole('heading', { level: 1, name: 'Import workouts' })).toBeTruthy();
    expect(screen.getByText(/In Strong: Profile → Settings → Export data/)).toBeTruthy();
    expect(screen.getByText(/In Hevy: Profile → Settings/)).toBeTruthy();
    expect(screen.getByLabelText('Choose your CSV file')).toBeTruthy();
  });

  it('asks kg or lb for an older Strong file, then previews with the answer', async () => {
    mockPreview.mockResolvedValueOnce({ status: 'needs_unit', source: 'STRONG' });
    render(<ImportView />);
    upload();
    fireEvent.click(await screen.findByText('Pounds (lb)'));
    await waitFor(() =>
      expect(mockPreview).toHaveBeenLastCalledWith(expect.objectContaining({ weightUnit: 'LB' })),
    );
    expect(await screen.findByTestId('gym-import-summary')).toBeTruthy();
  });

  it('says why a file is rejected', async () => {
    mockPreview.mockResolvedValueOnce({ status: 'invalid', reason: 'unknown_format' });
    render(<ImportView />);
    upload();
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /doesn’t look like a Strong or Hevy/,
    );
  });

  it('puts doubtful rows first, defaults unknown names to "create", and imports only what is new', async () => {
    render(<ImportView />);
    upload();
    expect(await screen.findByText('3 workouts · 40 sets')).toBeTruthy();
    expect(screen.getByText(/1 of these are already in Chefer/)).toBeTruthy();
    const gripper = screen.getByLabelText<HTMLSelectElement>('Hand Gripper');
    expect(gripper.value).toBe('__create__');
    expect(screen.getByLabelText<HTMLSelectElement>('Main muscle').value).toBe('forearms');
    expect(screen.getByText(/best guess, please check/)).toBeTruthy();

    // Map the gripper to the suggested alternative instead; skip the squat.
    fireEvent.change(gripper, { target: { value: 'barbell-wrist-curl' } });
    fireEvent.change(screen.getByLabelText('Squat (Barbell)'), { target: { value: '__skip__' } });
    expect(screen.getByTestId('gym-import-submit').textContent).toBe('Import 2 workouts');
    fireEvent.click(screen.getByTestId('gym-import-submit'));

    await waitFor(() => expect(mockCommit).toHaveBeenCalledTimes(1));
    const input = mockCommit.mock.calls[0]?.[0];
    expect(input?.timeZone).toBeTruthy();
    expect(input?.mappings).toEqual(
      expect.arrayContaining([
        { name: 'Hand Gripper', action: { type: 'existing', exerciseId: 'barbell-wrist-curl' } },
        { name: 'Squat (Barbell)', action: { type: 'skip' } },
        {
          name: 'Decline Chest Press (Machine)',
          action: { type: 'existing', exerciseId: 'machine-chest-press' },
        },
      ]),
    );
  });

  it('shows the result, refreshes gym data and records the event', async () => {
    render(<ImportView />);
    upload();
    fireEvent.click(await screen.findByTestId('gym-import-submit'));
    expect(await screen.findByText('Imported 2 workouts from Strong.')).toBeTruthy();
    expect(screen.getByText('1 new exercise was added to your library.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See your history' }).getAttribute('href')).toBe(
      '/gym/history',
    );
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledWith('workout_import_completed', {
      source: 'strong',
      workoutsBucket: '1-10',
      createdExercises: 1,
      reimport: true,
    });
  });

  it('a rate-limited import says when to try again', async () => {
    mockCommit.mockRejectedValueOnce({ data: { code: 'TOO_MANY_REQUESTS' } });
    render(<ImportView />);
    upload();
    fireEvent.click(await screen.findByTestId('gym-import-submit'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Try again in 10 minutes/);
  });
});
