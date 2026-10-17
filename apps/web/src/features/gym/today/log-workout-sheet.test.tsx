// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutSessionDoc } from '@chefer/types';
import { addDaysLocal } from '@chefer/utils';
import { localDate } from '../use-gym-bootstrap';
import { LogActivitySheet } from './log-activity-sheet';

// WP-20 "Log an activity" on web: the sheet, its validation and the doc it
// queues through the offline outbox (record only — nothing here touches food).

const { enqueue, setData, cancel, toast } = vi.hoisted(() => ({
  enqueue: vi.fn<[WorkoutSessionDoc, { ownerId: string | null }], undefined>(),
  setData: vi.fn(),
  cancel: vi.fn(() => Promise.resolve()),
  toast: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: { useUtils: () => ({ gym: { bootstrap: { cancel, setData } } }) },
}));
vi.mock('../workout/outbox', () => ({ outbox: { enqueue } }));
vi.mock('../workout/owner', () => ({ getGymOwner: () => 'user-1' }));
vi.mock('../shared/gym-toast', () => ({ showGymToast: toast }));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no scrolling; the Sheet's scroll lock calls it on unmount.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(cleanup);

function open(onClose = vi.fn()) {
  render(<LogActivitySheet open onClose={onClose} />);
  return onClose;
}

function queued(): WorkoutSessionDoc {
  expect(enqueue).toHaveBeenCalledTimes(1);
  const call = enqueue.mock.calls[0];
  if (!call) throw new Error('nothing was queued');
  return call[0];
}

describe('LogActivitySheet', () => {
  it('the common case is three taps — an activity, a duration, Save', async () => {
    const onClose = open();
    fireEvent.click(screen.getByTestId('log-activity-chip-cycling'));
    fireEvent.click(screen.getByTestId('log-activity-duration-chip-45'));
    fireEvent.click(screen.getByTestId('log-activity-save'));

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    const doc = queued();
    expect(doc).toMatchObject({
      status: 'COMPLETED',
      name: 'Cycling class',
      localDate: localDate(),
      routineDayId: null,
    });
    expect(doc.exercises[0]?.exerciseId).toBe('spin-class');
    expect(doc.exercises[0]?.sets[0]).toMatchObject({ durationSec: 2700 });
    expect(doc.exercises[0]?.sets[0]).not.toHaveProperty('caloriesKcal');
    expect(enqueue.mock.calls[0]?.[1]).toEqual({ ownerId: 'user-1' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ message: 'Cycling class logged' });
    // Folded into the cached bootstrap so History shows it at once.
    expect(setData).toHaveBeenCalled();
  });

  it('sends yesterday, the kcal, the effort and a custom name for Other', async () => {
    open();
    fireEvent.click(screen.getByTestId('log-activity-chip-other'));
    fireEvent.change(screen.getByTestId('log-activity-name'), {
      target: { value: 'Rock climbing' },
    });
    fireEvent.change(screen.getByTestId('log-activity-duration'), { target: { value: '50' } });
    const yesterday = addDaysLocal(localDate(), -1);
    fireEvent.change(screen.getByTestId('log-activity-date'), { target: { value: yesterday } });
    fireEvent.change(screen.getByTestId('log-activity-kcal'), { target: { value: '400' } });
    fireEvent.click(screen.getByTestId('log-activity-effort-hard'));
    fireEvent.click(screen.getByTestId('log-activity-save'));

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

  it('asks for what is missing in plain words and saves nothing', () => {
    open();
    fireEvent.click(screen.getByTestId('log-activity-save'));
    expect(screen.getByText('Pick what you did.')).toBeInTheDocument();
    expect(screen.getByText('Enter how many minutes it lasted.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('log-activity-chip-other'));
    fireEvent.click(screen.getByTestId('log-activity-duration-chip-30'));
    fireEvent.click(screen.getByTestId('log-activity-save'));
    expect(screen.getByText('Name the activity.')).toBeInTheDocument();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects more minutes than a set can hold', () => {
    open();
    fireEvent.click(screen.getByTestId('log-activity-chip-yoga'));
    fireEvent.change(screen.getByTestId('log-activity-duration'), { target: { value: '400' } });
    fireEvent.click(screen.getByTestId('log-activity-save'));
    expect(screen.getByText(/Up to 180 minutes/)).toBeInTheDocument();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps the date within the loggable window', () => {
    open();
    const date = screen.getByTestId('log-activity-date');
    expect(date).toHaveAttribute('max', localDate());
    expect(date).toHaveAttribute('min');
  });
});
