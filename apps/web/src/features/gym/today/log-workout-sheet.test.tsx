// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutSessionDoc } from '@chefer/types';
import { addDaysLocal } from '@chefer/utils';
import { localDate } from '../use-gym-bootstrap';
import { LogWorkoutSheet } from './log-workout-sheet';

// "Log a workout" on web (simple training mode §6.2, formerly WP-20 "Log an
// activity"): the sheet, its validation and the doc it queues through the
// offline outbox (record only — nothing here touches food).

const { enqueue, setData, cancel, toast, flags } = vi.hoisted(() => ({
  enqueue: vi.fn<[WorkoutSessionDoc, { ownerId: string | null }], undefined>(),
  setData: vi.fn(),
  cancel: vi.fn(() => Promise.resolve()),
  toast: vi.fn(),
  flags: { simpleTraining: false },
}));

vi.mock('@/lib/trpc', () => ({
  trpc: { useUtils: () => ({ gym: { bootstrap: { cancel, setData } } }) },
}));
vi.mock('@/features/flags/use-flags', () => ({ useFlags: () => flags }));
vi.mock('../workout/outbox', () => ({ outbox: { enqueue } }));
vi.mock('../workout/owner', () => ({ getGymOwner: () => 'user-1' }));
vi.mock('../shared/gym-toast', () => ({ showGymToast: toast }));

beforeEach(() => {
  vi.clearAllMocks();
  flags.simpleTraining = false;
  // jsdom has no scrolling; the Sheet's scroll lock calls it on unmount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(cleanup);

function open(onClose = vi.fn(), initialType: 'YOGA' | null = null) {
  render(<LogWorkoutSheet open onClose={onClose} initialType={initialType} />);
  return onClose;
}

function queued(): WorkoutSessionDoc {
  expect(enqueue).toHaveBeenCalledTimes(1);
  const call = enqueue.mock.calls[0];
  if (!call) throw new Error('nothing was queued');
  return call[0];
}

describe('LogWorkoutSheet', () => {
  it('the common case is three taps — a type, a duration, Save', async () => {
    const onClose = open();
    expect(screen.getByRole('dialog', { name: 'Log a workout' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('log-workout-chip-SPIN'));
    fireEvent.click(screen.getByTestId('log-workout-duration-chip-45'));
    fireEvent.click(screen.getByTestId('log-workout-save'));

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    const doc = queued();
    expect(doc).toMatchObject({
      status: 'COMPLETED',
      name: 'Spin',
      workoutType: 'SPIN',
      localDate: localDate(),
      routineDayId: null,
    });
    expect(doc.exercises[0]?.sets[0]).toMatchObject({ durationSec: 2700 });
    expect(doc.exercises[0]?.sets[0]).not.toHaveProperty('caloriesKcal');
    expect(enqueue.mock.calls[0]?.[1]).toEqual({ ownerId: 'user-1' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ message: 'Spin logged' });
    // Folded into the cached bootstrap so History shows it at once.
    expect(setData).toHaveBeenCalled();
  });

  it('sends yesterday, the watch kcal, the effort and an optional name for Other', async () => {
    open();
    fireEvent.click(screen.getByTestId('log-workout-chip-OTHER'));
    expect(screen.getByLabelText('Name (optional)')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('log-workout-name'), {
      target: { value: 'Rock climbing' },
    });
    fireEvent.change(screen.getByTestId('log-workout-duration'), { target: { value: '50' } });
    const yesterday = addDaysLocal(localDate(), -1);
    fireEvent.change(screen.getByTestId('log-workout-date'), { target: { value: yesterday } });
    fireEvent.change(screen.getByTestId('log-workout-kcal'), { target: { value: '400' } });
    fireEvent.click(screen.getByTestId('log-workout-effort-hard'));
    fireEvent.click(screen.getByTestId('log-workout-save'));

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    const doc = queued();
    expect(doc.name).toBe('Rock climbing');
    expect(doc.localDate).toBe(yesterday);
    expect(doc.exercises[0]?.exerciseId).toBe('other-activity');
    expect(doc.exercises[0]?.sets[0]).toMatchObject({
      durationSec: 3000,
      caloriesKcal: 400,
      intensityRpe: 7,
    });
  });

  it('an unnamed Other saves under the type label (the name is optional)', async () => {
    open();
    fireEvent.click(screen.getByTestId('log-workout-chip-OTHER'));
    fireEvent.click(screen.getByTestId('log-workout-duration-chip-30'));
    fireEvent.click(screen.getByTestId('log-workout-save'));
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(queued().name).toBe('Other');
  });

  it('asks for what is missing in plain words and saves nothing', () => {
    open();
    fireEvent.click(screen.getByTestId('log-workout-save'));
    expect(screen.getByText('Pick a workout type.')).toBeInTheDocument();
    expect(screen.getByText('Enter how many minutes it lasted.')).toBeInTheDocument();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects more minutes than a set can hold', () => {
    open();
    fireEvent.click(screen.getByTestId('log-workout-chip-YOGA'));
    fireEvent.change(screen.getByTestId('log-workout-duration'), { target: { value: '400' } });
    fireEvent.click(screen.getByTestId('log-workout-save'));
    expect(screen.getByText(/Up to 180 minutes/)).toBeInTheDocument();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps the date within the loggable window', () => {
    open();
    const date = screen.getByTestId('log-workout-date');
    expect(date).toHaveAttribute('max', localDate());
    expect(date).toHaveAttribute('min');
  });

  it('shows the strength types only with simple training on, and preselects a type', () => {
    open(vi.fn(), 'YOGA');
    expect(screen.queryByTestId('log-workout-chip-UPPER_BODY')).toBeNull();
    expect(screen.getByTestId('log-workout-chip-YOGA')).toHaveAttribute('aria-pressed', 'true');
    cleanup();
    flags.simpleTraining = true;
    open();
    expect(screen.getByTestId('log-workout-chip-UPPER_BODY')).toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
  });
});
