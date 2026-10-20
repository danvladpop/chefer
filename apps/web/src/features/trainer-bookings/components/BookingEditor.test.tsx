// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainerBookingDto } from '@chefer/types';
import { booking, client, TZ } from '../lib/test-fixtures';
import { BookingEditor, type EditorTarget } from './BookingEditor';

const m = vi.hoisted(() => ({
  clients: [] as { clientId: string; name: string; label: string | null }[],
  range: [] as TrainerBookingDto[],
  created: [] as unknown[],
  updated: [] as unknown[],
  capture: vi.fn(),
}));

vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  deviceTimeZone: () => 'Europe/Bucharest',
}));
vi.mock('@/features/trainer/use-trainer-status', () => ({
  useTrainerStatus: () => ({ gymLine: 'Gym Fit Center' }),
}));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => {
      const inv = { invalidate: vi.fn() };
      return {
        trainer: {
          bookings: inv,
          dashboard: { summary: inv },
          client: { bookings: inv },
          badges: inv,
          clients: { list: inv },
        },
      };
    },
    trainer: {
      clients: { list: { useQuery: () => ({ data: m.clients, isLoading: false }) } },
      templates: { list: { useQuery: () => ({ data: [{ id: 't1', name: 'Push day' }] }) } },
      client: {
        routine: {
          useQuery: () => ({
            data: {
              name: 'Strength 3x',
              days: [
                { id: 'd1', name: 'Lower body A' },
                { id: 'd2', name: 'Upper body A' },
              ],
            },
          }),
        },
      },
      bookings: {
        range: { useQuery: () => ({ data: { bookings: m.range } }) },
        create: {
          useMutation: () => ({
            mutate: (input: unknown) => m.created.push(input),
            isPending: false,
          }),
        },
        update: {
          useMutation: () => ({
            mutate: (input: unknown) => m.updated.push(input),
            isPending: false,
          }),
        },
      },
    },
  },
}));

const create = (over: Partial<Extract<EditorTarget, { mode: 'create' }>> = {}): EditorTarget => ({
  mode: 'create',
  date: '2026-10-20',
  time: '18:00',
  ...over,
});

function open(target: EditorTarget) {
  const onClose = vi.fn();
  render(<BookingEditor target={target} onClose={onClose} />);
  return { onClose, dialog: screen.getByRole('dialog') };
}

beforeEach(() => {
  m.clients = [
    { clientId: 'c1', name: 'Maria Pop', label: null },
    { clientId: 'c2', name: 'Ion Pop', label: null },
  ];
  m.range = [];
  m.created = [];
  m.updated = [];
  m.capture.mockClear();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  // The Sheet's scroll lock restores the page position; jsdom has no scrolling.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(cleanup);

describe('BookingEditor', () => {
  it('creates a weekly booking for two clients: date, time, zone, workouts, gym line, until', () => {
    const { dialog } = open(create());
    expect(within(dialog).getByRole('heading', { name: 'New booking' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Maria Pop' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Ion Pop' }));
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Maria Pop' }), {
      target: { value: 'day:d2' },
    });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Ion Pop' }), {
      target: { value: 'tpl:t1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '45 min' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Every week' }));
    expect(within(dialog).getByText('For 12 weeks')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Until'), { target: { value: '2026-12-15' } });
    fireEvent.change(within(dialog).getByLabelText('Note for the client'), {
      target: { value: 'Bring your belt' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(m.created).toEqual([
      {
        kind: 'BOOKING',
        date: '2026-10-20',
        time: '18:00',
        timeZone: TZ,
        durationMin: 45,
        clients: [
          { clientId: 'c1', workout: { kind: 'ROUTINE_DAY', routineDayId: 'd2' } },
          { clientId: 'c2', workout: { kind: 'TEMPLATE', templateId: 't1' } },
        ],
        location: 'Gym Fit Center',
        note: 'Bring your belt',
        repeat: { rule: 'WEEKLY', until: '2026-12-15' },
      },
    ]);
  });

  it('pre-fills a client from client detail, and a drag-chosen duration as Custom', () => {
    const { dialog } = open(
      create({ durationMin: 75, clients: [{ clientId: 'c2', name: 'Ion Pop' }] }),
    );
    expect(within(dialog).getByRole('checkbox', { name: 'Ion Pop' })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Custom' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(m.created[0]).toMatchObject({
      durationMin: 75,
      clients: [{ clientId: 'c2' }],
      repeat: null,
    });
  });

  it('needs a client for a booking; the error is linked to the field', () => {
    const { dialog } = open(create());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(m.created).toEqual([]);
    const group = within(dialog).getByRole('group', { name: 'Clients' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription(/Pick at least one client\./);
  });

  it('blocked time hides Clients and the note, and saves no clients', () => {
    const { dialog } = open(create());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Blocked time' }));
    expect(within(dialog).queryByRole('group', { name: 'Clients' })).toBeNull();
    expect(within(dialog).queryByLabelText('Note for the client')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(m.created[0]).toMatchObject({ kind: 'BLOCK', clients: [] });
  });

  it('caps a booking at 6 clients', () => {
    m.clients = Array.from({ length: 7 }, (_, i) => ({
      clientId: `c${i}`,
      name: `Client ${i}`,
      label: null,
    }));
    const { dialog } = open(create());
    for (let i = 0; i < 6; i++) {
      fireEvent.click(within(dialog).getByRole('checkbox', { name: `Client ${i}` }));
    }
    expect(within(dialog).getByRole('checkbox', { name: 'Client 6' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Client 0' })).toBeEnabled();
    expect(within(dialog).getByText('Up to 6 clients')).toBeInTheDocument();
  });

  it('warns about overlaps from the cached week but still saves', () => {
    m.range = [booking({ id: 'other', time: '18:30' })];
    const { dialog } = open(create({ clients: [{ clientId: 'c2', name: 'Ion Pop' }] }));
    expect(within(dialog).getByTestId('booking-overlap-warning')).toHaveTextContent(
      'Overlaps with 18:30 Maria',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(m.created).toHaveLength(1);
  });

  it('refuses to save offline with the shared message', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { dialog } = open(create({ clients: [{ clientId: 'c2', name: 'Ion Pop' }] }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(m.created).toEqual([]);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'You’re offline. Adding and changing bookings needs a connection.',
    );
  });

  it('editing a repeating booking asks the scope, then sends only the change', () => {
    const series = booking({ seriesId: 's1', version: 3, clients: [client()] });
    const { dialog } = open({ mode: 'edit', booking: series });
    expect(within(dialog).getByRole('heading', { name: 'Edit booking' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio', { name: 'Every week' })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Start'), { target: { value: '19:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(m.updated).toEqual([]);
    expect(within(dialog).getByText('Change repeating booking')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'This and following' }));
    expect(m.updated).toEqual([
      {
        bookingId: 'b1',
        expectedVersion: 3,
        scope: 'FOLLOWING',
        patch: { date: '2026-10-20', time: '19:00', timeZone: TZ },
      },
    ]);
  });

  it('editing a one-off booking saves with scope THIS and no question', () => {
    const { dialog } = open({ mode: 'edit', booking: booking() });
    fireEvent.click(within(dialog).getByRole('button', { name: '90 min' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(m.updated).toEqual([
      { bookingId: 'b1', expectedVersion: 1, scope: 'THIS', patch: { durationMin: 90 } },
    ]);
  });
});
