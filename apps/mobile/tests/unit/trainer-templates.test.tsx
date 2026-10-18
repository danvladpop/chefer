import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type {
  TrainerRoutineDto,
  WorkoutTemplateDto,
  WorkoutTemplateExerciseDto,
  WorkoutTemplateSummaryDto,
} from '@chefer/types';
import { resetEntrancesForTests, resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainerClientRoute from '../../app/trainer/[clientId]/index';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetShellModeStoreForTests } from '../../src/features/trainer-mode/mode-store';
import { AssignTemplateSheet } from '../../src/features/trainer-mode/templates/assign-sheet';
import { TemplateLibraryScreen } from '../../src/features/trainer-mode/templates/library-screen';
import { TemplateEditorScreen } from '../../src/features/trainer-mode/templates/template-editor-screen';
import { UpdateClientsSheet } from '../../src/features/trainer-mode/templates/update-clients-sheet';
import { TEMPLATE_AUTOSAVE_MS } from '../../src/features/trainer-mode/templates/use-template-editor';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { makeExercise } from './gym-fixtures';
import {
  adherence,
  clientRow,
  ION,
  LIBRARY,
  MARIA,
  nextTarget,
  settle,
  trainerHandlers,
  trainerRoutine,
} from './trainer-fixtures';
import { trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer mode M2 (docs/prd-2026-10/trainer-mode.md §6.6): the template library, the editor (DayEditor
// template role, autosave + conflict, limits, starting weight), the assign sheet, Update for clients and
// client detail's "Assign a template".

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  },
  useLocalSearchParams: () => ({ clientId: 'cmaria000000000000000001' }),
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-crypto', () => {
  let n = 9000;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const PLANK = { ...makeExercise('plank', 'Plank'), isTimed: true, loadType: 'BODYWEIGHT' as const };
const TEMPLATE_LIBRARY = [...LIBRARY, PLANK];

function summary(overrides: Partial<WorkoutTemplateSummaryDto> = {}): WorkoutTemplateSummaryDto {
  return {
    id: 't1',
    name: 'Lower body A',
    workoutType: 'LOWER_BODY',
    exerciseCount: 5,
    estimatedMin: 45,
    assignedCount: 2,
    outdatedCount: 0,
    updatedAt: '2026-10-03T09:00:00.000Z',
    ...overrides,
  };
}

function row(
  exerciseId: string,
  position: number,
  overrides: Partial<WorkoutTemplateExerciseDto> = {},
): WorkoutTemplateExerciseDto {
  return {
    id: `x-${exerciseId}`,
    exerciseId,
    position,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSec: 120,
    supersetGroup: null,
    defaultLoadKg: null,
    trainerNote: null,
    ...overrides,
  };
}

function template(overrides: Partial<WorkoutTemplateDto> = {}): WorkoutTemplateDto {
  return {
    id: 't1',
    name: 'Lower body A',
    workoutType: 'LOWER_BODY',
    version: 3,
    updatedAt: '2026-10-03T09:00:00.000Z',
    exercises: [row('squat', 0, { defaultLoadKg: 60 }), row('plank', 1)],
    exerciseMeta: [],
    assignments: [],
    ...overrides,
  };
}

function handlers(overrides = {}) {
  return trainerModeHandlers({
    'trainer.templates.list': () => [summary()],
    'trainer.templates.get': () => template(),
    'gym.library.list': () => TEMPLATE_LIBRARY,
    ...overrides,
  });
}

const DAY = 'routine-editor-day-template';
const exerciseRow = (key: string) => `${DAY}-exercise-${key}`;

async function waitAutosave() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, TEMPLATE_AUTOSAVE_MS + 50));
  });
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetShellModeStoreForTests();
  resetSnackbarForTests();
  resetEntrancesForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('the template library', () => {
  const rows = [
    summary(),
    summary({
      id: 't2',
      name: 'Upper push',
      workoutType: 'UPPER_BODY',
      assignedCount: 0,
      estimatedMin: null,
      exerciseCount: 0,
    }),
    summary({ id: 't3', name: 'Lower body B', workoutType: 'LOWER_BODY', assignedCount: 1 }),
  ];

  it('lists each template with its type, size and who has it; a tap opens it', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TemplateLibraryScreen />,
      handlers({ 'trainer.templates.list': () => rows }),
    );
    await settle();
    const first = screen.getByTestId('template-row-t1');
    expect(first).toHaveAccessibleName(
      'Lower body A. Lower body · 5 exercises · ~45 min. Assigned to 2 clients · Edited 3 Oct',
    );
    expect(screen.getByTestId('template-row-t2-status')).toHaveTextContent(
      'Not assigned yet · Edited 3 Oct',
    );
    await user.press(first);
    expect(router.push).toHaveBeenCalledWith('/trainer/templates/t1');
  });

  it('search filters by name; the type chips filter by workout type', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TemplateLibraryScreen />,
      handlers({ 'trainer.templates.list': () => rows }),
    );
    await settle();
    await fireEvent.changeText(screen.getByTestId('templates-search'), 'lower');
    expect(screen.getByTestId('template-row-t1')).toBeTruthy();
    expect(screen.getByTestId('template-row-t3')).toBeTruthy();
    expect(screen.queryByTestId('template-row-t2')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('templates-search'), 'zzz');
    expect(screen.getByTestId('templates-search-empty')).toHaveTextContent(
      'No template matches “zzz”.',
    );

    await fireEvent.changeText(screen.getByTestId('templates-search'), '');
    await user.press(screen.getByTestId('templates-type-UPPER_BODY'));
    expect(screen.getByTestId('template-row-t2')).toBeTruthy();
    expect(screen.queryByTestId('template-row-t1')).toBeNull();
    await user.press(screen.getByTestId('templates-type-all'));
    expect(screen.getByTestId('template-row-t1')).toBeTruthy();
  });

  it('empty: the empty state, and New template opens the editor on a new template', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TemplateLibraryScreen />,
      handlers({ 'trainer.templates.list': () => [] }),
    );
    await settle();
    expect(screen.getByText('No templates yet')).toBeTruthy();
    expect(screen.getByText('Build a workout once, give it to any client.')).toBeTruthy();
    await user.press(screen.getByTestId('templates-library-empty-new'));
    expect(router.push).toHaveBeenCalledWith('/trainer/templates/new');
  });
});

describe('the template editor', () => {
  it('a new template is created only once it has a name (debounced), then saved by version', async () => {
    const user = userEvent.setup();
    const created = template({ id: 't9', name: 'Pull day', version: 1, exercises: [] });
    const r = await renderWithTrpc(
      <TemplateEditorScreen templateId={null} />,
      handlers({
        'trainer.templates.create': () => created,
        'trainer.templates.save': () => ({ ...created, version: 2 }),
      }),
    );
    await settle();
    expect(screen.getByTestId('template-editor-header-title')).toHaveTextContent('New template');
    expect(screen.getByTestId('template-editor-assign')).toBeDisabled();

    // An exercise with no name yet: nothing is saved.
    await user.press(screen.getByTestId(`${DAY}-add-exercise`));
    expect(screen.getByTestId('template-editor-picker-curated-only')).toBeTruthy();
    expect(screen.queryByText('Maria Custom Lift')).toBeNull();
    await user.press(screen.getByTestId('template-editor-picker-item-squat'));
    await waitAutosave();
    expect(r.paths()).not.toContain('trainer.templates.create');
    expect(screen.getByTestId('template-editor-name-needed')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('template-editor-name'), 'P');
    await fireEvent.changeText(screen.getByTestId('template-editor-name'), 'Pull day');
    expect(r.paths()).not.toContain('trainer.templates.create');
    await waitAutosave();
    const creates = r.calls.filter((c) => c.path === 'trainer.templates.create');
    expect(creates).toHaveLength(1);
    expect(creates[0]?.input).toMatchObject({
      name: 'Pull day',
      workoutType: null,
      exercises: [{ exerciseId: 'squat', defaultLoadKg: null, trainerNote: null }],
    });
    expect(track).toHaveBeenCalledWith('template_created', {});
    expect(screen.getByTestId('template-editor-status')).toHaveTextContent('Saved');

    await fireEvent.changeText(screen.getByTestId('template-editor-name'), 'Pull day B');
    await waitAutosave();
    const save = r.calls.find((c) => c.path === 'trainer.templates.save')?.input;
    expect(save).toMatchObject({ templateId: 't9', expectedVersion: 1 });
    expect(r.calls.filter((c) => c.path === 'trainer.templates.create')).toHaveLength(1);
  });

  it('a stale version opens the conflict sheet: Keep mine re-saves on the newer version', async () => {
    const user = userEvent.setup();
    const theirs = template({ version: 5, name: 'Lower body (theirs)' });
    let saves = 0;
    const r = await renderWithTrpc(
      <TemplateEditorScreen templateId="t1" />,
      handlers({
        'trainer.templates.save': () => {
          saves += 1;
          if (saves === 1) {
            throw trpcError('CONFLICT', 409, { conflict: { kind: 'template', current: theirs } });
          }
          return template({ version: 6, name: 'Lower body A+' });
        },
      }),
    );
    await settle();
    await fireEvent.changeText(screen.getByTestId('template-editor-name'), 'Lower body A+');
    await waitAutosave();
    expect(screen.getByTestId('template-editor-conflict-version')).toHaveTextContent(
      'Server version 5',
    );
    await user.press(screen.getByTestId('template-editor-conflict-keep-mine'));
    await settle();
    const inputs = r.calls
      .filter((c) => c.path === 'trainer.templates.save')
      .map((c) => c.input as { expectedVersion: number; template: { name: string } });
    expect(inputs.map((i) => i.expectedVersion)).toEqual([3, 5]);
    expect(inputs[1]?.template.name).toBe('Lower body A+');
  });

  it('Use the other version loads the server copy and drops the edits', async () => {
    const user = userEvent.setup();
    const theirs = template({ version: 5, name: 'Lower body (theirs)' });
    const r = await renderWithTrpc(
      <TemplateEditorScreen templateId="t1" />,
      handlers({
        'trainer.templates.save': () => {
          throw trpcError('CONFLICT', 409, { conflict: { kind: 'template', current: theirs } });
        },
      }),
    );
    await settle();
    await fireEvent.changeText(screen.getByTestId('template-editor-name'), 'Mine');
    await waitAutosave();
    await user.press(screen.getByTestId('template-editor-conflict-use-theirs'));
    await settle();
    expect(screen.getByTestId('template-editor-name').props.value).toBe('Lower body (theirs)');
    await waitAutosave();
    expect(r.calls.filter((c) => c.path === 'trainer.templates.save')).toHaveLength(1);
  });

  it('20 exercises: Add exercise is off and the limit is explained', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `ex${i}`);
    await renderWithTrpc(
      <TemplateEditorScreen templateId="t1" />,
      handlers({
        'trainer.templates.get': () => template({ exercises: ids.map((id, i) => row(id, i)) }),
        'gym.library.list': () => ids.map((id) => makeExercise(id)),
      }),
    );
    await settle();
    expect(screen.getByTestId(`${DAY}-add-exercise`)).toBeDisabled();
    expect(screen.getByTestId(`${DAY}-exercise-limit`)).toHaveTextContent(
      'A template holds up to 20 exercises.',
    );
  });

  it('Starting weight only on weighted strength rows; typing it is saved in kg', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <TemplateEditorScreen templateId="t1" />,
      handlers({ 'trainer.templates.save': () => template({ version: 4 }) }),
    );
    await settle();
    // No day name, weekday or day menu in a template.
    expect(screen.queryByTestId(`${DAY}-name`)).toBeNull();
    expect(screen.queryByTestId(`${DAY}-day-menu`)).toBeNull();
    expect(screen.getByTestId(`${exerciseRow('x-squat')}-default-load`)).toHaveTextContent(
      'Starting weight 60 kg',
    );

    await user.press(screen.getByTestId(`${exerciseRow('x-plank')}-toggle`));
    expect(screen.queryByTestId(`${exerciseRow('x-plank')}-default-load-field`)).toBeNull();
    expect(screen.getByTestId(`${exerciseRow('x-plank')}-trainer-note-input`)).toHaveAccessibleName(
      'Note for clients',
    );

    await user.press(screen.getByTestId(`${exerciseRow('x-squat')}-toggle`));
    const field = screen.getByTestId(`${exerciseRow('x-squat')}-default-load-field-input`);
    expect(field.props.value).toBe('60');
    await fireEvent.changeText(field, '62,5');
    await waitAutosave();
    const sent = r.calls.find((c) => c.path === 'trainer.templates.save')?.input as {
      template: { exercises: { exerciseId: string; defaultLoadKg: number | null }[] };
    };
    expect(sent.template.exercises).toEqual([
      expect.objectContaining({ exerciseId: 'squat', defaultLoadKg: 62.5 }),
      expect.objectContaining({ exerciseId: 'plank', defaultLoadKg: null }),
    ]);
  });

  it('assignments: who has it, and the older-version banner opens Update for clients', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TemplateEditorScreen templateId="t1" />,
      handlers({
        'trainer.templates.get': () =>
          template({
            assignments: [
              {
                clientId: MARIA,
                clientName: 'Maria Pop',
                routineDayId: 'd1',
                dayName: 'Lower body A',
                templateVersion: 2,
                outdated: true,
                editedSince: false,
                assignedAt: '2026-10-01T09:00:00.000Z',
              },
            ],
          }),
      }),
    );
    await settle();
    expect(screen.getByTestId('template-editor-outdated')).toHaveTextContent(
      /1 client has an older version/,
    );
    expect(screen.getByTestId(`template-editor-assigned-${MARIA}`)).toHaveTextContent(
      /Lower body A · Older version/,
    );
    await user.press(screen.getByTestId('template-editor-update'));
    expect(screen.getByTestId('update-sheet-title')).toHaveTextContent('Update for clients');
  });
});

describe('the assign sheet', () => {
  const ionRoutine: TrainerRoutineDto = trainerRoutine({ id: 'r2', name: 'Ion routine' });

  function assignHandlers(overrides = {}) {
    return handlers({
      'trainer.clients.list': () => [
        clientRow(),
        clientRow({ clientId: ION, name: 'Ion Rus', label: null }),
      ],
      'trainer.client.routine': (input: unknown) =>
        (input as { clientId: string }).clientId === MARIA ? trainerRoutine() : ionRoutine,
      ...overrides,
    });
  }

  it('Add as a new day (with a weekday) and Replace a day send one target per client', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <AssignTemplateSheet visible onClose={jest.fn()} template={{ id: 't1', name: 'Lower A' }} />,
      assignHandlers({
        'trainer.templates.assign': () => ({
          templateId: 't1',
          templateVersion: 3,
          results: [
            { clientId: MARIA, ok: true, routineDayId: 'new1' },
            { clientId: ION, ok: false, reason: 'DAY_LIMIT' },
          ],
        }),
      }),
    );
    await settle();
    expect(screen.getByTestId('assign-sheet-title')).toHaveTextContent('Assign Lower A');
    await user.press(screen.getByTestId(`assign-sheet-client-${MARIA}`));
    await user.press(screen.getByTestId(`assign-sheet-client-${ION}`));
    await user.press(screen.getByTestId('assign-sheet-next'));
    await settle();

    await user.press(screen.getByTestId(`assign-sheet-choice-${MARIA}-weekday-2`));
    await user.press(screen.getByTestId(`assign-sheet-choice-${ION}-replace`));
    // Replace needs a day picked first.
    expect(screen.getByTestId('assign-sheet-confirm')).toHaveTextContent('Assign to 1 client');
    await user.press(screen.getByTestId(`assign-sheet-choice-${ION}-day-d1`));
    expect(screen.getByTestId('assign-sheet-confirm')).toHaveTextContent('Assign to 2 clients');
    await user.press(screen.getByTestId('assign-sheet-confirm'));
    await settle();

    expect(r.calls.find((c) => c.path === 'trainer.templates.assign')?.input).toEqual({
      templateId: 't1',
      targets: [
        { clientId: MARIA, mode: 'ADD_DAY', weekday: 2 },
        { clientId: ION, mode: 'REPLACE_DAY', routineDayId: 'd1' },
      ],
    });
    expect(track).toHaveBeenCalledWith('template_assigned', { clients: 1 });
    expect(screen.getByTestId('assign-sheet-done')).toHaveTextContent('Assigned to 1 client');
    expect(screen.getByTestId(`assign-sheet-failure-${ION}`)).toHaveTextContent(
      'Ion Rus: Already has 7 days',
    );
    expect(screen.getByTestId('assign-sheet-tune')).toHaveTextContent(
      'Set weights for each client',
    );
  });

  it('a client with no routine cannot be picked for a day; other failures are counted', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <AssignTemplateSheet visible onClose={jest.fn()} template={{ id: 't1', name: 'Lower A' }} />,
      assignHandlers({
        'trainer.client.routine': (input: unknown) =>
          (input as { clientId: string }).clientId === MARIA ? trainerRoutine() : null,
        'trainer.templates.assign': () => ({
          templateId: 't1',
          templateVersion: 3,
          results: [{ clientId: MARIA, ok: false, reason: 'CONFLICT' }],
        }),
      }),
    );
    await settle();
    await user.press(screen.getByTestId(`assign-sheet-client-${MARIA}`));
    await user.press(screen.getByTestId(`assign-sheet-client-${ION}`));
    await user.press(screen.getByTestId('assign-sheet-next'));
    await settle();
    expect(screen.getByTestId(`assign-sheet-choice-${ION}-no-routine`)).toHaveTextContent(
      'Has no routine yet',
    );
    expect(screen.queryByTestId(`assign-sheet-choice-${ION}-add`)).toBeNull();
    expect(screen.getByTestId('assign-sheet-confirm')).toHaveTextContent('Assign to 1 client');
    await user.press(screen.getByTestId('assign-sheet-confirm'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.templates.assign')?.input).toEqual({
      templateId: 't1',
      targets: [{ clientId: MARIA, mode: 'ADD_DAY', weekday: null }],
    });
    expect(screen.getByTestId('assign-sheet-failed')).toHaveTextContent('1 client couldn’t get it');
    expect(screen.queryByTestId('assign-sheet-tune')).toBeNull();
    expect(track).not.toHaveBeenCalledWith('template_assigned', expect.anything());
  });

  it('Set weights: the client’s suggestion next to the template default; a changed kg is saved', async () => {
    const user = userEvent.setup();
    const assigned = trainerRoutine();
    const day = assigned.days[0];
    if (day) day.id = 'new1';
    const bench = day?.exercises[0];
    if (bench) bench.next = nextTarget({ lastDoneDate: '2026-10-01' });
    const onClose = jest.fn();
    const r = await renderWithTrpc(
      <AssignTemplateSheet visible onClose={onClose} template={{ id: 't1', name: 'Lower A' }} />,
      handlers({
        'trainer.clients.list': () => [clientRow()],
        'trainer.client.routine': () => assigned,
        'trainer.templates.get': () =>
          template({ exercises: [row('bench', 0, { defaultLoadKg: 55 })] }),
        'trainer.templates.assign': () => ({
          templateId: 't1',
          templateVersion: 3,
          results: [{ clientId: MARIA, ok: true, routineDayId: 'new1' }],
        }),
        'trainer.client.setNextTarget': () => nextTarget(),
      }),
    );
    await settle();
    await user.press(screen.getByTestId(`assign-sheet-client-${MARIA}`));
    await user.press(screen.getByTestId('assign-sheet-next'));
    await settle();
    await user.press(screen.getByTestId('assign-sheet-confirm'));
    await settle();
    await user.press(screen.getByTestId('assign-sheet-tune'));
    await settle();
    const tune = screen.getByTestId('assign-sheet-tune-step-row-bench');
    expect(within(tune).getByText('Last time 60 kg · Template 55 kg')).toBeTruthy();
    const input = screen.getByTestId('assign-sheet-tune-step-row-bench-input');
    expect(input.props.value).toBe('60');
    await fireEvent.changeText(input, '62.5');
    await user.press(screen.getByTestId('assign-sheet-tune-step-save'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.client.setNextTarget')?.input).toEqual({
      clientId: MARIA,
      exerciseId: 'bench',
      repBucket: '6-8',
      weightKg: 62.5,
      reps: [8, 8, 8],
    });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Update for clients', () => {
  const base = {
    routineDayId: 'd1',
    dayName: 'Lower A',
    templateVersion: 2,
    assignedAt: '2026-10-01T09:00:00.000Z',
  };
  const DAN = 'cdan0000000000000000003';
  const withAssignments = template({
    assignments: [
      { ...base, clientId: MARIA, clientName: 'Maria Pop', outdated: true, editedSince: false },
      { ...base, clientId: ION, clientName: 'Ion Rus', outdated: true, editedSince: true },
      {
        ...base,
        clientId: DAN,
        clientName: 'Dan Pop',
        templateVersion: 3,
        outdated: false,
        editedSince: false,
      },
    ],
  });

  it('ticks older copies, leaves edited-since ones unticked, disables up-to-date ones', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const r = await renderWithTrpc(
      <UpdateClientsSheet visible onClose={onClose} template={withAssignments} />,
      handlers({
        'trainer.templates.updateClients': () => ({
          templateId: 't1',
          templateVersion: 3,
          results: [{ clientId: MARIA, ok: true, routineDayId: 'd1' }],
        }),
      }),
    );
    await settle();
    expect(screen.getByTestId(`update-sheet-client-${MARIA}`)).toBeChecked();
    const ion = screen.getByTestId(`update-sheet-client-${ION}`);
    expect(ion).not.toBeChecked();
    expect(ion).toHaveAccessibleName(
      'Ion Rus. Lower A · Edited since. Updating replaces their changes',
    );
    const dan = screen.getByTestId(`update-sheet-client-${DAN}`);
    expect(dan).toBeDisabled();
    expect(dan).toHaveAccessibleName('Dan Pop. Lower A · Up to date');

    expect(screen.getByTestId('update-sheet-confirm')).toHaveTextContent('Update 1 client');
    await user.press(screen.getByTestId('update-sheet-confirm'));
    await settle();
    expect(r.calls.find((c) => c.path === 'trainer.templates.updateClients')?.input).toEqual({
      templateId: 't1',
      clientIds: [MARIA],
    });
    expect(track).toHaveBeenCalledWith('template_clients_updated', { clients: 1 });
    await waitFor(() => expect(screen.getByText('Updated 1 client')).toBeTruthy());
    expect(onClose).toHaveBeenCalled();
  });
});

describe('client detail: Assign a template', () => {
  const overview = {
    'trainer.client.overview': () => ({
      client: { name: 'Maria Pop', since: '2026-09-20T09:00:00.000Z' },
      adherence: adherence(),
      recent: [],
    }),
    'trainer.client.workouts': () => ({ items: [], nextCursor: null }),
    'trainer.client.note': () => null,
  };

  it('flag off: no Assign a template', async () => {
    await renderWithTrpc(<TrainerClientRoute />, trainerHandlers(overview));
    await settle();
    expect(screen.getByTestId('trainer-client-edit-routine')).toBeTruthy();
    expect(screen.queryByTestId('trainer-client-assign-template')).toBeNull();
  });

  it('trainer mode on: it opens the sheet on "pick a template" with this client ticked', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerClientRoute />,
      handlers({ ...overview, 'trainer.client.routine': () => trainerRoutine() }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-client-assign-template'));
    await settle();
    expect(screen.getByTestId('trainer-client-assign-sheet-title')).toHaveTextContent(
      'Assign a template',
    );
    await user.press(screen.getByTestId('trainer-client-assign-sheet-template-t1'));
    await user.press(screen.getByTestId('trainer-client-assign-sheet-next'));
    expect(screen.getByTestId('trainer-client-assign-sheet-title')).toHaveTextContent(
      'Assign Lower body A',
    );
    expect(screen.getByTestId(`trainer-client-assign-sheet-client-${MARIA}`)).toBeChecked();
  });
});
