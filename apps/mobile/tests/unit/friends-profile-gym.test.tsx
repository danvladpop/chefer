import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { getQueryKey } from '@trpc/react-query';
import type { FriendWorkoutDto } from '@chefer/types';
import { GymTab } from '../../src/features/friends/profile/gym/gym-tab';
import { setLines, topSetLine } from '../../src/features/friends/profile/gym/workout-format';
import { isGymQueryKey } from '../../src/features/gym/offline/query-persistence';
import { trpc } from '../../src/lib/trpc';
import { availableHandlers, renderWithTrpc, type Handlers } from './friends-core-harness';
import { profileDto, routineDto, testQueryClient, workoutsDto } from './friends-profile-fixtures';

// Gym tab (UX §10, PRD FR-18, FR-19): the routine read-only (custom names,
// Show all after 4), every workout of the last 7 days in ONE list (no Load
// more), weights in the VIEWER's units, and nothing under a gym query key.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const METRIC = { 'preferences.get': () => ({ chefProfile: { preferredUnits: 'METRIC' } }) };
const IMPERIAL = { 'preferences.get': () => ({ chefProfile: { preferredUnits: 'IMPERIAL' } }) };

function renderGym(h: Handlers, queryClient = testQueryClient()) {
  return renderWithTrpc(
    <GymTab profile={profileDto()} me={undefined} />,
    {
      ...availableHandlers(),
      'friends.routine': () => routineDto(),
      'friends.workouts': () => workoutsDto(),
      ...METRIC,
      ...h,
    },
    queryClient,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('routine', () => {
  it('reads like the owner’s routine, without weights; `(custom)`; Show all after 4', async () => {
    await renderGym({});
    expect(await screen.findByText('Push Pull Legs')).toBeTruthy();
    expect(screen.getByText('Push · Mon')).toBeTruthy();
    expect(screen.getByText('Pull · Wed')).toBeTruthy();
    expect(screen.getAllByText('3 × 8–12 · 2:30').length).toBeGreaterThan(0);
    expect(screen.getByText('Dips (custom)')).toBeTruthy();
    expect(screen.queryByText('Triceps pushdown')).toBeNull();
    expect(screen.queryByText(/Next:/)).toBeNull();
    await userEvent.setup().press(screen.getByTestId('friends-routine-day-0-show-all'));
    expect(await screen.findByText('Triceps pushdown')).toBeTruthy();
    expect(screen.queryByTestId('friends-routine-day-0-show-all')).toBeNull();
  });

  it('an exercise reads `3 sets of 8–12 reps`; curated ones open their page, custom ones don’t', async () => {
    await renderGym({});
    const bench = await screen.findByLabelText('Bench press, 3 sets of 8–12 reps');
    await userEvent.setup().press(bench);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/exercise/[id]',
      params: { id: 'ex-bench-press' },
    });
    const dips = screen.getByLabelText('Dips (custom), 3 sets of 8–12 reps');
    expect(dips.props.accessibilityRole).toBeUndefined();
  });

  it('no routine → `{first} doesn’t have a routine yet.`', async () => {
    await renderGym({ 'friends.routine': () => null });
    expect(await screen.findByText('Carol doesn’t have a routine yet.')).toBeTruthy();
  });
});

describe('last 7 days', () => {
  it('lists every workout in one list, with no Load more', async () => {
    await renderGym({});
    expect(await screen.findByText('Tue 29 Sep · 58 min')).toBeTruthy();
    for (const w of workoutsDto())
      expect(screen.getByTestId(`friends-workouts-${w.id}`)).toBeTruthy();
    expect(screen.queryByText(/Load more/i)).toBeNull();
    expect(screen.getAllByText('2 exercises')).toHaveLength(5);
  });

  it('shows the top set in kg, and every set after `Show sets`', async () => {
    await renderGym({});
    expect((await screen.findAllByText('80 kg × 8')).length).toBe(5);
    expect(screen.getAllByText('30 min · 5 km')).toHaveLength(5);
    await userEvent.setup().press(screen.getByTestId('friends-workouts-w0-toggle'));
    expect(await screen.findByTestId('friends-workouts-w0-exercise-0-set-2')).toBeTruthy();
    expect(screen.getByText('75 kg × 9')).toBeTruthy();
    expect(screen.getByText('Hide sets')).toBeTruthy();
  });

  it('uses the viewer’s units: imperial food units → lb and miles', async () => {
    await renderGym(IMPERIAL);
    await waitFor(() => expect(screen.getAllByText('176.4 lb × 8')).toHaveLength(5));
    expect(screen.getAllByText('30 min · 3.1 mi')).toHaveLength(5);
  });

  it('prefers the viewer’s cached gym unit, without creating or fetching any gym query', async () => {
    const qc = testQueryClient();
    qc.setQueryData(getQueryKey(trpc.gym.bootstrap, undefined, 'query'), {
      profile: { unit: 'LB', distanceUnit: 'KM' },
    });
    const r = await renderGym({}, qc);
    await waitFor(() => expect(screen.getAllByText('176.4 lb × 8')).toHaveLength(5));
    expect(screen.getAllByText('30 min · 5 km')).toHaveLength(5);
    expect(r.paths().some((p) => p.startsWith('gym.'))).toBe(false);
    const gymKeys = qc
      .getQueryCache()
      .getAll()
      .filter((q) => isGymQueryKey(q.queryKey));
    // Only the one the test seeded; nothing observes it.
    expect(gymKeys).toHaveLength(1);
    expect(gymKeys[0]?.getObserversCount()).toBe(0);
  });

  it('empty → `No workouts in the last 7 days.`', async () => {
    await renderGym({ 'friends.workouts': () => [] });
    expect(await screen.findByText('No workouts in the last 7 days.')).toBeTruthy();
  });
});

describe('workout-format', () => {
  const kg = { weight: 'KG', distance: 'KM' } as const;
  const bodyweight: FriendWorkoutDto['exercises'][number] = {
    exerciseId: 'ex-pull-up',
    name: 'Pull-up',
    isCustom: false,
    trackingType: 'BODYWEIGHT_REPS',
    sets: [
      { weightKg: 0, reps: 10 },
      { weightKg: 10, reps: 6 },
    ],
  };

  it('formats bodyweight sets as BW / BW + load', () => {
    expect(setLines(bodyweight, kg)).toEqual(['BW × 10', 'BW + 10 kg × 6']);
    expect(topSetLine(bodyweight, kg)).toBe('BW + 10 kg × 6');
  });

  it('an exercise with no sets has no line', () => {
    expect(topSetLine({ ...bodyweight, sets: [] }, kg)).toBe('');
  });
});

it('the gym tab’s own queries are friends.* keys only (INV-7)', async () => {
  const r = await renderGym({});
  await screen.findByText('Push Pull Legs');
  await waitFor(() => expect(r.paths()).toContain('friends.workouts'));
  const keys = r.queryClient
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey);
  expect(keys.some(isGymQueryKey)).toBe(false);
  expect(r.paths()).not.toContain('gym.bootstrap');
});
