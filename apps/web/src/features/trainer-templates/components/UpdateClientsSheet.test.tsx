// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutTemplateAssignmentDto, WorkoutTemplateTargetsResultDto } from '@chefer/types';
import { templateDto } from '../test-fixtures';
import { UpdateClientsSheet } from './UpdateClientsSheet';

type UpdateOptions = { onSuccess?: (res: WorkoutTemplateTargetsResultDto) => void };

const m = vi.hoisted(
  (): {
    update: ReturnType<typeof vi.fn>;
    options: UpdateOptions;
    capture: ReturnType<typeof vi.fn>;
    toast: ReturnType<typeof vi.fn>;
  } => ({ update: vi.fn(), options: {}, capture: vi.fn(), toast: vi.fn() }),
);

vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/lib/app-toast', () => ({ showAppToast: m.toast }));
vi.mock('@/lib/trpc', () => {
  const noop = vi.fn();
  return {
    trpc: {
      useUtils: () => ({
        trainer: {
          templates: { get: { invalidate: noop }, list: { invalidate: noop } },
          client: { routine: { invalidate: noop } },
        },
      }),
      trainer: {
        templates: {
          updateClients: {
            useMutation: (options: UpdateOptions) => {
              m.options = options;
              return { mutate: m.update, isPending: false };
            },
          },
        },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);

function assignment(
  clientId: string,
  clientName: string,
  over: Partial<WorkoutTemplateAssignmentDto>,
): WorkoutTemplateAssignmentDto {
  return {
    clientId,
    clientName,
    routineDayId: `${clientId}-day`,
    dayName: 'Day A',
    templateVersion: 2,
    outdated: true,
    editedSince: false,
    assignedAt: '2026-10-01T10:00:00.000Z',
    ...over,
  };
}

const template = templateDto({
  assignments: [
    assignment('c1', 'Maria Pop', {}),
    assignment('c2', 'Ion Rus', { editedSince: true }),
    assignment('c3', 'Ana Dan', { outdated: false, templateVersion: 3 }),
  ],
});

describe('UpdateClientsSheet', () => {
  it('ticks outdated copies, leaves edited ones unticked with a warning, disables up to date', () => {
    const onClose = vi.fn();
    render(<UpdateClientsSheet open onClose={onClose} template={template} />);
    const maria = screen.getByRole('checkbox', { name: /Maria Pop/ });
    const ion = screen.getByRole('checkbox', { name: /Ion Rus/ });
    const ana = screen.getByRole('checkbox', { name: /Ana Dan/ });
    expect(maria).toBeChecked();
    expect(ion).not.toBeChecked();
    expect(ion).toHaveAccessibleDescription('Edited since. Updating replaces their changes');
    expect(ana).toBeDisabled();
    expect(ana).toHaveAccessibleDescription('Up to date');

    fireEvent.click(ion);
    fireEvent.click(screen.getByRole('button', { name: 'Update 2 clients' }));
    expect(m.update).toHaveBeenCalledWith({ templateId: 'tpl1', clientIds: ['c1', 'c2'] });

    act(() =>
      m.options.onSuccess?.({
        templateId: 'tpl1',
        templateVersion: 3,
        results: [
          { clientId: 'c1', ok: true, routineDayId: 'c1-day' },
          { clientId: 'c2', ok: true, routineDayId: 'c2-day' },
        ],
      }),
    );
    expect(m.capture).toHaveBeenCalledWith('template_clients_updated', { clients: 2 });
    expect(m.toast).toHaveBeenCalledWith({ message: 'Updated 2 clients', type: 'success' });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the sheet open with the reason when a client could not be updated', () => {
    const onClose = vi.fn();
    render(<UpdateClientsSheet open onClose={onClose} template={template} />);
    fireEvent.click(screen.getByRole('button', { name: 'Update 1 client' }));
    act(() =>
      m.options.onSuccess?.({
        templateId: 'tpl1',
        templateVersion: 3,
        results: [{ clientId: 'c1', ok: false, reason: 'CONFLICT' }],
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('update-failures')).toHaveTextContent(
      'Maria Pop: Their routine just changed. Try again',
    );
  });
});
