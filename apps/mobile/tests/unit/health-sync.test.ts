import { clearLocalUserData } from '../../src/features/gym/offline/clear-local-data';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import type {
  HealthMeal,
  HealthWorkout,
  WeightSample,
} from '../../src/features/health/health-model';
import { setHealthStoreForTests, type HealthStore } from '../../src/features/health/health-store';
import {
  mirrorFinishedWorkout,
  readHealthSettings,
  runWeightImport,
  syncNutritionDay,
  withHealthType,
  writeHealthSettings,
  type HealthDay,
  type ImportWeights,
} from '../../src/features/health/health-sync';
import { makeDoc } from './gym-fixtures';

// C2: the sync jobs against a fake health store — only the types the user
// turned on run, the weight cursor only moves after a successful import, and
// food mirrors each day (upsert by entry id, remove deleted entries).

jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn(),
}));

function fakeStore(weights: WeightSample[] = []) {
  const writeWorkout = jest.fn<Promise<void>, [HealthWorkout]>(() => Promise.resolve());
  const writeMeals = jest.fn<Promise<void>, [readonly HealthMeal[]]>(() => Promise.resolve());
  const deleteMeals = jest.fn<Promise<void>, [readonly string[]]>(() => Promise.resolve());
  const store: HealthStore = {
    platform: 'HEALTH_CONNECT',
    isAvailable: () => Promise.resolve(true),
    requestAccess: (types) => Promise.resolve([...types]),
    readWeights: () => Promise.resolve(weights),
    readTodayActivity: () => Promise.resolve({ steps: null, activeKcal: null }),
    writeWorkout,
    writeMeals,
    deleteMeals,
    openSettings: () => Promise.resolve(),
  };
  return { store, writeWorkout, writeMeals, deleteMeals };
}

const turnOn = (...types: Parameters<typeof withHealthType>[2][]) => {
  let settings = readHealthSettings();
  for (const t of types) settings = withHealthType(settings, 'HEALTH_CONNECT', t, true);
  if (settings) writeHealthSettings(settings);
};

const NOW = new Date(2026, 9, 21, 12, 0);

const weight = (id: string, iso: string): WeightSample => ({
  id,
  weightKg: 80,
  at: new Date(iso),
  fromChefer: false,
});

const day = (entries: { id: string; mealType: string; recipeId?: string }[]): HealthDay => ({
  date: '2026-10-20',
  plannedMeals: [{ recipeId: 'r1', recipeName: 'Chicken bowl' }],
  offPlanLogged: [],
  log: {
    loggedMeals: entries.map((e) => ({
      entryId: e.id,
      mealType: e.mealType,
      recipeId: e.recipeId ?? null,
      custom: e.recipeId ? null : { name: 'Toast' },
      kcal: 400,
      protein: 25,
      carbs: 40,
      fat: 12,
    })),
  },
});

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  setHealthStoreForTests(undefined);
});

describe('settings', () => {
  it('start with nothing on, and switch one type at a time', () => {
    expect(readHealthSettings()).toBeNull();
    turnOn('weight', 'nutrition');
    expect(readHealthSettings()?.types).toEqual(['weight', 'nutrition']);
    writeHealthSettings(withHealthType(readHealthSettings(), 'HEALTH_CONNECT', 'weight', false));
    expect(readHealthSettings()?.types).toEqual(['nutrition']);
  });

  it('are forgotten on sign-out, so the next account starts with sync off', async () => {
    turnOn('weight');
    await clearLocalUserData({ keepGymData: false });
    expect(readHealthSettings()).toBeNull();
  });
});

describe('runWeightImport', () => {
  it('does nothing until weigh-ins are on', async () => {
    const { store } = fakeStore([weight('a', '2026-10-20T07:00:00.000Z')]);
    const importWeights = jest.fn<ReturnType<ImportWeights>, Parameters<ImportWeights>>();
    await runWeightImport(store, importWeights);
    expect(importWeights).not.toHaveBeenCalled();
  });

  it('imports new weigh-ins and moves the cursor to the newest one', async () => {
    turnOn('weight');
    const { store } = fakeStore([
      weight('a', '2026-10-20T07:00:00.000Z'),
      weight('b', '2026-10-22T07:00:00.000Z'),
    ]);
    const importWeights = jest.fn<ReturnType<ImportWeights>, Parameters<ImportWeights>>(() =>
      Promise.resolve({ imported: 2, skipped: 0 }),
    );
    await expect(runWeightImport(store, importWeights)).resolves.toEqual({
      imported: 2,
      skipped: 0,
    });
    expect(importWeights).toHaveBeenCalledWith({
      source: 'HEALTH_CONNECT',
      entries: [
        expect.objectContaining({ externalId: 'a' }),
        expect.objectContaining({ externalId: 'b' }),
      ],
    });
    expect(readHealthSettings()?.weightCursor).toBe('2026-10-22T07:00:00.000Z');
  });

  it('keeps the cursor when the import fails, so the next run retries', async () => {
    turnOn('weight');
    const { store } = fakeStore([weight('a', '2026-10-20T07:00:00.000Z')]);
    const importWeights = jest.fn<ReturnType<ImportWeights>, Parameters<ImportWeights>>(() =>
      Promise.reject(new Error('offline')),
    );
    await expect(runWeightImport(store, importWeights)).rejects.toThrow('offline');
    expect(readHealthSettings()?.weightCursor).toBeNull();
  });
});

describe('mirrorFinishedWorkout', () => {
  it('writes a finished workout only while workouts are on', async () => {
    const fake = fakeStore();
    setHealthStoreForTests(fake.store);
    mirrorFinishedWorkout(makeDoc(1));
    expect(fake.writeWorkout).not.toHaveBeenCalled();

    turnOn('workouts');
    mirrorFinishedWorkout(makeDoc(1));
    await Promise.resolve();
    expect(fake.writeWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Workout 1',
        start: new Date('2026-09-24T08:00:00.000Z'),
        end: new Date('2026-09-24T09:00:00.000Z'),
      }),
    );
  });

  it('does nothing on a binary without a health store', () => {
    turnOn('workouts');
    setHealthStoreForTests(null);
    expect(() => mirrorFinishedWorkout(makeDoc(1))).not.toThrow();
  });
});

describe('syncNutritionDay', () => {
  it('writes one record per entry, named after the recipe or the custom food', async () => {
    turnOn('nutrition');
    const fake = fakeStore();
    await syncNutritionDay(
      fake.store,
      day([
        { id: 'e1', mealType: 'LUNCH', recipeId: 'r1' },
        { id: 'e2', mealType: 'BREAKFAST' },
      ]),
      NOW,
    );
    const meals = fake.writeMeals.mock.calls[0]?.[0] ?? [];
    expect(meals.map((m) => [m.entryId, m.mealType, m.name])).toEqual([
      ['e1', 'lunch', 'Chicken bowl'],
      ['e2', 'breakfast', 'Toast'],
    ]);
    expect(fake.deleteMeals).toHaveBeenCalledWith([]);
  });

  it('removes an entry that was deleted since the last sync', async () => {
    turnOn('nutrition');
    const fake = fakeStore();
    await syncNutritionDay(
      fake.store,
      day([
        { id: 'e1', mealType: 'LUNCH', recipeId: 'r1' },
        { id: 'e2', mealType: 'DINNER' },
      ]),
      NOW,
    );
    await syncNutritionDay(fake.store, day([{ id: 'e1', mealType: 'LUNCH', recipeId: 'r1' }]), NOW);
    expect(fake.deleteMeals).toHaveBeenLastCalledWith(['e2']);
  });

  it('forgets the entry ids of days more than a month old', async () => {
    turnOn('nutrition');
    const settings = readHealthSettings();
    if (settings) writeHealthSettings({ ...settings, writtenMeals: { '2026-08-01': ['old'] } });
    await syncNutritionDay(fakeStore().store, day([{ id: 'e1', mealType: 'LUNCH' }]), NOW);
    expect(readHealthSettings()?.writtenMeals).toEqual({ '2026-10-20': ['e1'] });
  });

  it('does nothing until food is on', async () => {
    const fake = fakeStore();
    await syncNutritionDay(fake.store, day([{ id: 'e1', mealType: 'LUNCH' }]), NOW);
    expect(fake.writeMeals).not.toHaveBeenCalled();
  });
});
