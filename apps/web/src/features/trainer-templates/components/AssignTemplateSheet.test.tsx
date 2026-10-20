// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClientRowDto,
  TrainerRoutineDto,
  WorkoutTemplateSummaryDto,
  WorkoutTemplateTargetsResultDto,
} from '@chefer/types';
import { templateDto } from '../test-fixtures';
import { AssignTemplateSheet } from './AssignTemplateSheet';

type AssignOptions = {
  onSuccess?: (res: WorkoutTemplateTargetsResultDto, input: { templateId: string }) => void;
};

interface Mocks {
  clients: ClientRowDto[];
  routines: Record<string, TrainerRoutineDto | null>;
  library: WorkoutTemplateSummaryDto[];
  assign: ReturnType<typeof vi.fn>;
  assignOptions: AssignOptions;
  capture: ReturnType<typeof vi.fn>;
  toast: ReturnType<typeof vi.fn>;
}

const m = vi.hoisted(
  (): Mocks => ({
    clients: [],
    routines: {},
    library: [],
    assign: vi.fn(),
    assignOptions: {},
    capture: vi.fn(),
    toast: vi.fn(),
  }),
);

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/lib/app-toast', () => ({ showAppToast: m.toast }));
vi.mock('./TuneWeightsStep', () => ({
  TuneWeightsStep: ({ clients }: { clients: { name: string }[] }) => (
    <p data-testid="tune-stub">{clients.map((c) => c.name).join(', ')}</p>
  ),
}));
vi.mock('@/lib/trpc', () => {
  const noop = vi.fn();
  return {
    trpc: {
      useUtils: () => ({
        trainer: {
          templates: { get: { invalidate: noop }, list: { invalidate: noop } },
          clients: { list: { invalidate: noop } },
          client: { routine: { invalidate: noop } },
        },
      }),
      useQueries: (
        build: (t: {
          trainer: { client: { routine: (input: { clientId: string }) => string } };
        }) => string[],
      ) =>
        build({ trainer: { client: { routine: (input) => input.clientId } } }).map((clientId) => ({
          data: m.routines[clientId],
          isLoading: false,
          isError: false,
        })),
      trainer: {
        clients: { list: { useQuery: () => ({ data: m.clients, isLoading: false }) } },
        templates: {
          list: { useQuery: () => ({ data: m.library, isLoading: false }) },
          get: {
            useQuery: (_i: unknown, o: { enabled: boolean }) => ({
              data: o.enabled ? templateDto() : undefined,
            }),
          },
          assign: {
            useMutation: (options: AssignOptions) => {
              m.assignOptions = options;
              return { mutate: m.assign, isPending: false };
            },
          },
        },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

function client(clientId: string, name: string): ClientRowDto {
  const row: ClientRowDto = {
    clientId,
    name,
    since: '2026-09-01T10:00:00.000Z',
    label: null,
    lastWorkoutDate: null,
    week: { sessions: 0, goal: 3 },
    inactiveDays: 0,
    routineChangedByClientAt: null,
  };
  return row;
}

function routine(days: string[]): TrainerRoutineDto {
  return {
    id: 'r',
    name: 'Routine',
    templateKey: null,
    version: 1,
    nextDayId: null,
    updatedAt: '2026-10-01T10:00:00.000Z',
    lastEditedByOther: null,
    exercises: [],
    days: days.map((name, i) => ({
      id: `${name}-id`,
      position: i,
      name,
      plannedWeekday: null,
      exercises: [],
    })),
  };
}

beforeEach(() => {
  m.clients = [client('c1', 'Maria Pop'), client('c2', 'Ion Rus'), client('c3', 'Ana Noroutine')];
  m.routines = { c1: routine(['Day A', 'Day B']), c2: routine(['Legs']), c3: null };
  m.library = [];
  m.assign.mockReset();
  m.capture.mockReset();
  m.toast.mockReset();
});
afterEach(cleanup);

describe('AssignTemplateSheet', () => {
  it('sends a new day (with weekday) for one client and a replaced day for another', () => {
    render(<AssignTemplateSheet open onClose={vi.fn()} template={templateDto()} />);
    expect(screen.getByRole('dialog', { name: 'Assign Lower body A' })).toBeVisible();
    const confirm = () => screen.getByRole('button', { name: /^Assign to \d+ clients?$/ });
    expect(confirm()).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Maria Pop' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ion Rus' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana Noroutine' }));
    const [maria, ion, ana] = screen.getAllByTestId('assign-client-target');
    if (!maria || !ion || !ana) throw new Error('three clients');

    // Maria: a new day on Wednesday.
    fireEvent.change(within(maria).getByLabelText('Day of the week (optional)'), {
      target: { value: '2' },
    });
    // Ion: replace his Legs day; nothing to send until a day is picked.
    fireEvent.click(within(ion).getByRole('radio', { name: 'Replace a day' }));
    expect(confirm()).toHaveTextContent('Assign to 1 client');
    fireEvent.change(within(ion).getByLabelText('Which day'), { target: { value: 'Legs-id' } });
    // Ana has no routine: told so, and left out.
    expect(ana).toHaveTextContent('Has no routine yet');
    expect(confirm()).toHaveTextContent('Assign to 2 clients');

    fireEvent.click(confirm());
    expect(m.assign).toHaveBeenCalledWith({
      templateId: 'tpl1',
      targets: [
        { clientId: 'c1', mode: 'ADD_DAY', weekday: 2 },
        { clientId: 'c2', mode: 'REPLACE_DAY', routineDayId: 'Legs-id' },
      ],
    });
  });

  it('shows done and each failure reason, then tunes the clients who got it', () => {
    render(<AssignTemplateSheet open onClose={vi.fn()} template={templateDto()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Maria Pop' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ion Rus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign to 2 clients' }));
    act(() =>
      m.assignOptions.onSuccess?.(
        {
          templateId: 'tpl1',
          templateVersion: 3,
          results: [
            { clientId: 'c1', ok: true, routineDayId: 'new-day' },
            { clientId: 'c2', ok: false, reason: 'DAY_LIMIT' },
          ],
        },
        { templateId: 'tpl1' },
      ),
    );
    expect(m.capture).toHaveBeenCalledWith('template_assigned', { clients: 1 });
    const results = screen.getByTestId('assign-results');
    expect(results).toHaveTextContent('Assigned to 1 client');
    expect(results).toHaveTextContent('1 client couldn’t get it');
    expect(screen.getByTestId('assign-failures')).toHaveTextContent('Ion Rus: Already has 7 days');

    fireEvent.click(screen.getByRole('button', { name: 'Set weights for each client' }));
    expect(screen.getByTestId('tune-stub')).toHaveTextContent('Maria Pop');
  });

  it('from client detail: pick a template first, with that client ticked', () => {
    m.library = [
      {
        id: 'tpl1',
        name: 'Lower body A',
        workoutType: null,
        exerciseCount: 3,
        estimatedMin: 30,
        assignedCount: 0,
        outdatedCount: 0,
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
    ];
    render(<AssignTemplateSheet open onClose={vi.fn()} preselectedClientId="c2" />);
    expect(screen.getByRole('dialog', { name: 'Assign a template' })).toBeVisible();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'tpl1' } });
    fireEvent.click(next);
    expect(screen.getByRole('checkbox', { name: 'Ion Rus' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Assign to 1 client' }));
    expect(m.assign).toHaveBeenCalledWith({
      templateId: 'tpl1',
      targets: [{ clientId: 'c2', mode: 'ADD_DAY', weekday: null }],
    });
  });
});
