// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXERCISE_BY_ID, type WorkoutTemplateDto } from '@chefer/types';
import { templateDto, templateRow } from '../test-fixtures';
import { TEMPLATE_AUTOSAVE_MS, TemplateEditor } from './TemplateEditor';

type MutateOptions = {
  onSuccess?: (dto: WorkoutTemplateDto) => void;
  onError?: (err: unknown) => void;
};

const m = vi.hoisted(() => ({
  template: undefined as WorkoutTemplateDto | undefined,
  save: vi.fn<[unknown, MutateOptions], undefined>(),
  create: vi.fn<[unknown, MutateOptions], undefined>(),
  remove: vi.fn(),
  capture: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push, replace: vi.fn() }) }));
vi.mock('@/features/gym/library/ExerciseImage', () => ({ ExerciseImage: () => null }));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/lib/app-toast', () => ({ showAppToast: vi.fn() }));
vi.mock('./AssignTemplateSheet', () => ({
  AssignTemplateSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Assign" /> : null,
}));
vi.mock('./UpdateClientsSheet', () => ({
  UpdateClientsSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Update for clients" /> : null,
}));
vi.mock('@/lib/trpc', () => {
  const noop = vi.fn();
  const library = [...EXERCISE_BY_ID.values()].map((e) => ({ ...e, ownerId: null, images: [] }));
  return {
    trpc: {
      useUtils: () => ({
        trainer: {
          templates: { get: { setData: noop, invalidate: noop }, list: { invalidate: noop } },
        },
      }),
      gym: {
        profile: { get: { useQuery: () => ({ data: { unit: 'KG' } }) } },
        library: { list: { useQuery: () => ({ data: library }) } },
      },
      trainer: {
        templates: {
          get: {
            useQuery: (_input: unknown, opts: { enabled: boolean }) => ({
              data: opts.enabled ? m.template : undefined,
              isError: false,
              refetch: noop,
            }),
          },
          create: { useMutation: () => ({ mutate: m.create, isPending: false }) },
          save: { useMutation: () => ({ mutate: m.save, isPending: false }) },
          delete: { useMutation: () => ({ mutate: m.remove, isPending: false }) },
        },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  m.save.mockReset();
  m.create.mockReset();
  m.capture.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const nameField = () => screen.getByLabelText('Name');
const tick = () =>
  act(() => {
    vi.advanceTimersByTime(TEMPLATE_AUTOSAVE_MS + 10);
  });

describe('TemplateEditor', () => {
  it('has one h1 and a starting weight only on weight × reps rows', () => {
    m.template = templateDto();
    render(<TemplateEditor templateId="tpl1" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // Back squat yes; plank (timed) and push-ups (body weight) no. Desktop board shows every row's fields.
    const loads = screen.getAllByLabelText(/^Starting weight \(kg\)/);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toHaveAccessibleName(/^Starting weight \(kg\)\s?: Back Squat$/);
    expect(loads[0]).toHaveValue('60');
    expect(screen.getAllByLabelText('Note for clients').length).toBeGreaterThanOrEqual(3);
  });

  it('autosaves after a pause with the loaded version, and shows Saving… then Saved', () => {
    m.template = templateDto();
    render(<TemplateEditor templateId="tpl1" />);
    fireEvent.change(nameField(), { target: { value: 'Lower body B' } });
    expect(screen.getByTestId('template-save-status')).toHaveTextContent('Saving…');
    expect(m.save).not.toHaveBeenCalled();
    tick();
    expect(m.save).toHaveBeenCalledTimes(1);
    const [input, options] = m.save.mock.calls[0] ?? [];
    expect(input).toMatchObject({
      templateId: 'tpl1',
      expectedVersion: 3,
      template: { name: 'Lower body B', workoutType: 'LOWER_BODY' },
    });
    act(() => options?.onSuccess?.(templateDto({ name: 'Lower body B', version: 4 })));
    expect(screen.getByTestId('template-save-status')).toHaveTextContent('Saved');

    // The next edit saves against the new version.
    fireEvent.change(screen.getByLabelText(/^Starting weight/), { target: { value: '65' } });
    tick();
    expect(m.save.mock.calls[1]?.[0]).toMatchObject({
      expectedVersion: 4,
      template: { exercises: [{ exerciseId: 'back-squat', defaultLoadKg: 65 }, {}, {}] },
    });
  });

  it('a stale version opens Keep mine / Use the other version', () => {
    m.template = templateDto();
    render(<TemplateEditor templateId="tpl1" />);
    fireEvent.change(nameField(), { target: { value: 'Mine' } });
    tick();
    const current = templateDto({ name: 'Theirs', version: 7 });
    act(() =>
      m.save.mock.calls[0]?.[1].onError?.({ data: { conflict: { kind: 'template', current } } }),
    );
    expect(screen.getByRole('dialog', { name: 'This template changed elsewhere' })).toBeVisible();

    // Keep mine: the same draft against the server's version.
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(m.save).toHaveBeenCalledTimes(2);
    expect(m.save.mock.calls[1]?.[0]).toMatchObject({
      expectedVersion: 7,
      template: { name: 'Mine' },
    });

    // Another conflict; this time take theirs.
    act(() =>
      m.save.mock.calls[1]?.[1].onError?.({ data: { conflict: { kind: 'template', current } } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use the other version' }));
    expect(nameField()).toHaveValue('Theirs');
    tick();
    expect(m.save).toHaveBeenCalledTimes(2);
  });

  it('stops adding at 20 exercises and says so', () => {
    m.template = templateDto({
      exercises: Array.from({ length: 20 }, (_, i) =>
        templateRow('back-squat', { id: `r${i}`, position: i }),
      ),
    });
    render(<TemplateEditor templateId="tpl1" />);
    expect(screen.getByTestId('template-exercise-limit')).toHaveTextContent(
      'A template holds up to 20 exercises.',
    );
    for (const add of screen.getAllByRole('button', { name: /Add exercise/ })) {
      expect(add).toBeDisabled();
    }
  });

  it('a new template is created only once it has a name and an exercise or type', () => {
    m.template = undefined;
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<TemplateEditor templateId="new" />);
    expect(screen.getByRole('heading', { level: 1, name: 'New template' })).toBeVisible();
    fireEvent.change(nameField(), { target: { value: 'Yoga flow' } });
    tick();
    expect(m.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Workout type'), { target: { value: 'YOGA' } });
    tick();
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create.mock.calls[0]?.[0]).toEqual({
      name: 'Yoga flow',
      workoutType: 'YOGA',
      exercises: [],
    });
    act(() =>
      m.create.mock.calls[0]?.[1].onSuccess?.(
        templateDto({ id: 'tplNew', name: 'Yoga flow', workoutType: 'YOGA', exercises: [] }),
      ),
    );
    expect(m.capture).toHaveBeenCalledWith('template_created', {});
    expect(replaceState).toHaveBeenCalledWith(null, '', '/trainer/workouts/tplNew');
  });

  it('shows the outdated banner and the assigned-to list', () => {
    m.template = templateDto({
      assignments: [
        {
          clientId: 'c1',
          clientName: 'Maria Pop',
          routineDayId: 'd1',
          dayName: 'Day A',
          templateVersion: 2,
          outdated: true,
          editedSince: false,
          assignedAt: '2026-10-01T10:00:00.000Z',
        },
        {
          clientId: 'c2',
          clientName: 'Ion Rus',
          routineDayId: 'd9',
          dayName: 'Legs',
          templateVersion: 3,
          outdated: false,
          editedSince: false,
          assignedAt: '2026-10-01T10:00:00.000Z',
        },
      ],
    });
    render(<TemplateEditor templateId="tpl1" />);
    expect(screen.getByTestId('template-outdated-banner')).toHaveTextContent(
      '1 client has an older version',
    );
    const rows = screen.getAllByTestId('template-assignment');
    expect(rows[0]).toHaveTextContent('Maria Pop');
    expect(rows[0]).toHaveTextContent('Older version');
    expect(rows[1]).toHaveTextContent('Up to date');
    fireEvent.click(screen.getByRole('button', { name: 'Update for clients' }));
    expect(screen.getByRole('dialog', { name: 'Update for clients' })).toBeInTheDocument();
  });
});
