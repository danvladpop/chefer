import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { AccountData } from './account-data.service.js';
import {
  archiveFilename,
  buildArchive,
  buildCsvFiles,
  type ExtraArchiveInput,
} from './export-archive.js';

// G1 full data export: the ZIP a user downloads. Built from a fixture of the
// typed export object, so every CSV is checked without a database.

const d = (iso: string) => new Date(iso);

function fixture(overrides: Partial<{ food: object; gym: object }> = {}): AccountData {
  const base = {
    exportedAt: '2026-10-22T10:00:00.000Z',
    user: { id: 'u1', email: 'ana@test.dev', name: 'Ana' },
    food: {
      chefProfile: {
        id: 'c1',
        userId: 'u1',
        dailyCalorieTarget: 2100,
        goal: 'LOSE_WEIGHT',
        heightCm: 168,
      },
      dietaryPreferences: { id: 'd1', userId: 'u1', allergies: ['peanuts', 'sesame'] },
      householdMembers: [],
      mealPlans: [
        {
          id: 'p2',
          weekStartDate: d('2026-10-19'),
          isTemplate: false,
          name: null,
          days: [
            { dayOfWeek: 1, meals: [{ type: 'dinner', recipeId: 'r-own' }] },
            { dayOfWeek: 0, meals: [{ type: 'breakfast', recipeId: 'r-oats' }] },
          ],
        },
        {
          id: 'p-tpl',
          weekStartDate: d('2026-01-05'),
          isTemplate: true,
          name: 'Busy week',
          days: [{ dayOfWeek: 2, meals: [{ type: 'lunch', recipeId: 'r-oats' }] }],
        },
      ],
      dailyLogs: [
        {
          date: d('2026-10-21'),
          loggedMeals: [
            {
              recipeId: 'r-oats',
              mealType: 'breakfast',
              portionMultiplier: 1,
              kcal: 410,
              protein: 18.24,
              carbs: 60,
              fat: 9,
            },
            {
              custom: { name: 'Apple', estimatedBy: 'manual' },
              mealType: 'snack',
              portionMultiplier: 1,
              kcal: 95,
              protein: 0.5,
              carbs: 25,
              fat: 0.3,
            },
            'not an entry',
          ],
        },
        {
          date: d('2026-10-20'),
          loggedMeals: [
            {
              recipeId: 'r-gone',
              mealType: 'lunch',
              portionMultiplier: 2,
              kcal: 900,
              protein: 50,
              carbs: 80,
              fat: 30,
            },
          ],
        },
      ],
      weightEntries: [
        { recordedAt: d('2026-10-21T07:00:00Z'), weightKg: 70.04 },
        { recordedAt: d('2026-10-01T07:00:00Z'), weightKg: 71.5 },
      ],
      favourites: [],
      ratings: [],
      pantryItems: [],
      recipes: [
        {
          id: 'r-own',
          name: '=HYPERLINK("http://x")',
          servings: 2,
          prepTimeMins: 10,
          cookTimeMins: 20,
          nutritionInfo: { calories: 512.4, protein: 30, carbs: 40, fat: 20 },
          ingredients: [
            { name: 'chickpeas', quantity: 400, unit: 'g' },
            { name: 'lemon', quantity: 1, unit: '' },
          ],
          instructions: ['Rinse, then drain.', 'Roast "hot".'],
          sourceUrl: null,
        },
      ],
      chefReviews: [],
      shoppingLists: [
        {
          planId: 'p2',
          checkedKeys: ['oats|g'],
          items: [
            { key: 'oats|g', ingredientName: 'oats', quantity: '500', unit: 'g' },
            { key: 'milk|ml', ingredientName: 'milk', quantity: '1', unit: 'l' },
          ],
          customItems: [{ key: 'custom:soap', name: 'dish soap', quantity: null, unit: '' }],
        },
      ],
      savedRecipes: [
        {
          id: 'r-oats',
          savedAt: d('2026-10-01'),
          name: 'Overnight oats',
          servings: 1,
          prepTimeMins: 5,
          cookTimeMins: 0,
          nutritionInfo: { calories: 410, protein: 18, carbs: 60, fat: 9 },
          ingredients: [{ name: 'oats', quantity: 60, unit: 'g' }],
          instructions: ['Mix and chill.'],
          sourceUrl: 'https://example.com/oats',
        },
        // Saved AND yours: listed once, as yours.
        {
          id: 'r-own',
          savedAt: d('2026-10-02'),
          name: 'dup',
          servings: 1,
          prepTimeMins: 0,
          cookTimeMins: 0,
          nutritionInfo: {},
          ingredients: [],
          instructions: [],
          sourceUrl: null,
        },
      ],
      targetChanges: [
        {
          createdAt: d('2026-10-10T08:00:00Z'),
          kind: 'WEEKLY_REVIEW',
          reason: 'Weight trend',
          fields: [{ field: 'dailyCalorieTarget', before: 2200, after: 2100 }],
          resolution: 'USE_NEW',
        },
      ],
      ...overrides.food,
    },
    gym: {
      gymProfile: { id: 'g1', userId: 'u1', unit: 'KG' },
      routines: [
        {
          name: 'Upper/Lower',
          days: [
            {
              position: 0,
              name: 'Upper',
              exercises: [
                {
                  position: 1,
                  exerciseId: 'barbell-row',
                  sets: 3,
                  repMin: 8,
                  repMax: 12,
                  restSec: 120,
                  notes: null,
                },
                {
                  position: 0,
                  exerciseId: 'barbell-bench-press',
                  sets: 3,
                  repMin: 5,
                  repMax: 8,
                  restSec: 180,
                  notes: 'Pause 1s',
                },
              ],
            },
          ],
        },
      ],
      workoutSessions: [],
      exerciseProgressions: [],
      trainingPauses: [],
      customExercises: [],
      personalRecords: [
        {
          exerciseId: 'barbell-bench-press',
          exercise: 'Bench Press',
          kind: 'e1rm',
          weightKg: 80,
          reps: 5,
          e1rmKg: 93.333,
          localDate: '2026-10-01',
          sessionId: 's1',
          isFirst: false,
        },
      ],
      exerciseNames: { 'barbell-bench-press': 'Bench Press', 'barbell-row': 'Barbell Row' },
      ...overrides.gym,
    },
    feedback: [],
    social: {
      settings: null,
      following: [{ name: 'Carol', since: d('2026-09-01') }],
      followers: [],
      pendingRequests: { sent: [], received: [{ name: 'Dave', requestedAt: d('2026-10-02') }] },
      blocksMade: [],
      activity: [],
      reportsFiled: [],
      recipeCopies: [],
      consentHistory: [],
    },
    coaching: {
      asClient: {
        trainers: [{ trainer: 'Coach Mia', since: d('2026-08-01'), endedAt: null, endedBy: null }],
        trainerNotesAboutYou: [],
        bookings: [],
        consentHistory: [],
      },
      asTrainer: { profile: null, clients: [], invites: [], privateNotes: [], bookings: [] },
    },
    signInMethods: [],
    progress: {
      state: null,
      events: [
        { localDate: '2026-10-21', kind: 'meal_logged', xp: 10, origin: 'live' },
        { localDate: '2026-10-21', kind: 'workout_completed', xp: 40, origin: 'backfill' },
      ],
      unlocks: [{ achievementId: 'first-cook', tier: 1, unlockedAt: d('2026-10-21T19:00:00Z') }],
      questDays: [],
      cookLogs: [
        {
          localDate: '2026-10-21',
          recipeId: 'r-oats',
          startedAt: null,
          finishedAt: d('2026-10-21T08:10:00Z'),
        },
      ],
    },
    privacy: { consentHistory: [], emailPreferences: null, aiCallLog: [] },
  };
  return base as unknown as AccountData;
}

const extra: ExtraArchiveInput = {
  recipeNames: new Map([
    ['r-oats', 'Overnight oats'],
    ['r-own', 'Chickpea traybake'],
  ]),
  workoutsCsv: 'Date,Session,Exercise\r\n2026-10-01,Upper,Bench Press',
};

const lines = (csv: string | undefined) => (csv ?? '').split('\r\n');

describe('buildCsvFiles', () => {
  const files = buildCsvFiles(fixture(), extra);

  it('writes one CSV per area the user owns data in', () => {
    expect(Object.keys(files).sort()).toEqual(
      [
        'achievements.csv',
        'coaching.csv',
        'cooking.csv',
        'following.csv',
        'food-log.csv',
        'kitchen-progress.csv',
        'meal-plans.csv',
        'personal-records.csv',
        'profile-and-targets.csv',
        'recipes.csv',
        'routines.csv',
        'shopping-lists.csv',
        'target-changes.csv',
        'weights.csv',
        'workouts.csv',
      ].map((f) => `csv/${f}`),
    );
  });

  it('food log: oldest day first, recipe names resolved, custom foods by name, junk rows skipped', () => {
    expect(lines(files['csv/food-log.csv'])).toEqual([
      'Date,Meal,Food,Portion,Calories (kcal),Protein (g),Carbs (g),Fat (g),Kind',
      // A recipe that no longer exists keeps its id rather than vanishing.
      '2026-10-20,lunch,r-gone,2,900,50,80,30,recipe',
      '2026-10-21,breakfast,Overnight oats,1,410,18.2,60,9,recipe',
      '2026-10-21,snack,Apple,1,95,0.5,25,0.3,custom',
    ]);
  });

  it('weights: oldest first, kg and lb', () => {
    expect(lines(files['csv/weights.csv'])).toEqual([
      'Recorded at,Weight (kg),Weight (lb)',
      '2026-10-01T07:00:00.000Z,71.5,157.6',
      '2026-10-21T07:00:00.000Z,70.04,154.4',
    ]);
  });

  it('profile and targets: every setting, without ids', () => {
    const csv = files['csv/profile-and-targets.csv'] ?? '';
    expect(csv).toContain('profile,dailyCalorieTarget,2100');
    expect(csv).toContain('food preferences,allergies,peanuts; sesame');
    expect(csv).toContain('gym,unit,KG');
    expect(csv).not.toMatch(/userId|,id,/);
  });

  it('target changes: one row per changed field', () => {
    expect(lines(files['csv/target-changes.csv'])[1]).toBe(
      '2026-10-10T08:00:00.000Z,WEEKLY_REVIEW,Weight trend,dailyCalorieTarget,2200,2100,USE_NEW',
    );
  });

  it('meal plans: weeks by date, saved weeks by name, days in order', () => {
    expect(lines(files['csv/meal-plans.csv'])).toEqual([
      'Week starting,Saved week,Day,Meal,Recipe',
      ',Busy week,Wed,lunch,Overnight oats',
      '2026-10-19,,Mon,breakfast,Overnight oats',
      '2026-10-19,,Tue,dinner,Chickpea traybake',
    ]);
  });

  it('recipes: yours then saved, each once, with ingredients and steps; formulas neutralised', () => {
    const rows = lines(files['csv/recipes.csv']);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe(
      `"'=HYPERLINK(""http://x"")",yours,2,10,20,512,30,40,20,400 g chickpeas; 1  lemon,"1. Rinse, then drain. 2. Roast ""hot"".",`,
    );
    expect(rows[2]).toBe(
      'Overnight oats,saved,1,5,0,410,18,60,9,60 g oats,1. Mix and chill.,https://example.com/oats',
    );
  });

  it('shopping lists: ticked state and your own additions', () => {
    expect(lines(files['csv/shopping-lists.csv'])).toEqual([
      'Week starting,Item,Quantity,Unit,Ticked,Added by you',
      '2026-10-19,oats,500,g,yes,no',
      '2026-10-19,milk,1,l,no,no',
      '2026-10-19,dish soap,,,no,yes',
    ]);
  });

  it('workouts: the gym history CSV, unchanged', () => {
    expect(files['csv/workouts.csv']).toBe(extra.workoutsCsv);
  });

  it('routines: exercises named and in order', () => {
    expect(lines(files['csv/routines.csv']).slice(1)).toEqual([
      'Upper/Lower,Upper,1,Bench Press,3,5,8,180,Pause 1s',
      'Upper/Lower,Upper,2,Barbell Row,3,8,12,120,',
    ]);
  });

  it('personal records: readable kind, rounded e1RM', () => {
    expect(lines(files['csv/personal-records.csv'])[1]).toBe(
      '2026-10-01,Bench Press,estimated 1RM,80,5,93.3,no',
    );
  });

  it('following and coaching: names only', () => {
    expect(lines(files['csv/following.csv']).slice(1)).toEqual([
      'you follow,Carol,2026-09-01T00:00:00.000Z',
      'request received,Dave,2026-10-02T00:00:00.000Z',
    ]);
    expect(lines(files['csv/coaching.csv'])[1]).toBe(
      'your trainer,Coach Mia,2026-08-01T00:00:00.000Z,',
    );
  });

  it('Kitchen progress: XP by day, badges, and cook-mode sessions with recipe names', () => {
    expect(lines(files['csv/kitchen-progress.csv'])).toEqual([
      'Date,Earned for,XP,Recorded',
      '2026-10-21,meal_logged,10,live',
      '2026-10-21,workout_completed,40,backfill',
    ]);
    expect(lines(files['csv/achievements.csv'])[1]).toBe('first-cook,1,2026-10-21T19:00:00.000Z');
    expect(lines(files['csv/cooking.csv'])[1]).toBe(
      '2026-10-21,Overnight oats,,2026-10-21T08:10:00.000Z',
    );
  });

  it('an empty account still gets every file, header only', () => {
    const empty = buildCsvFiles(
      fixture({
        food: {
          dailyLogs: [],
          weightEntries: [],
          mealPlans: [],
          recipes: [],
          savedRecipes: [],
          shoppingLists: [],
          targetChanges: [],
        },
        gym: { routines: [], personalRecords: [] },
      }),
      { recipeNames: new Map(), workoutsCsv: 'Date' },
    );
    expect(lines(empty['csv/food-log.csv'])).toHaveLength(1);
    expect(lines(empty['csv/meal-plans.csv'])).toHaveLength(1);
  });
});

describe('buildArchive', () => {
  it('zips README, the full JSON and every CSV (with a BOM for Excel)', () => {
    const data = fixture();
    const unzipped = unzipSync(buildArchive(data, extra));
    expect(Object.keys(unzipped)).toEqual(
      expect.arrayContaining([
        'README.txt',
        'chefer-data.json',
        'csv/food-log.csv',
        'csv/workouts.csv',
      ]),
    );
    const json = JSON.parse(strFromU8(unzipped['chefer-data.json']!)) as {
      user: { email: string };
    };
    expect(json.user.email).toBe('ana@test.dev');
    const readme = strFromU8(unzipped['README.txt']!);
    for (const file of Object.keys(buildCsvFiles(data, extra))) {
      expect(readme).toContain(file.replace('csv/', ''));
    }
    // TextDecoder drops a BOM, so check the bytes: EF BB BF.
    expect([...unzipped['csv/weights.csv']!.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('a heavy account (3 years of logs, 600 workouts) builds fast and small enough to send inline', () => {
    const days = Array.from({ length: 3 * 365 }, (_, i) => ({
      date: new Date(Date.UTC(2023, 0, 1 + i)),
      loggedMeals: Array.from({ length: 5 }, (_, m) => ({
        recipeId: `r${m}`,
        mealType: 'lunch',
        portionMultiplier: 1,
        kcal: 500,
        protein: 30,
        carbs: 50,
        fat: 15,
      })),
    }));
    const workoutRows = Array.from(
      { length: 600 * 6 * 4 },
      (_, i) => `2025-01-01,Upper,Bench Press,${i % 4},n,80,8,,,,,`,
    );
    const started = performance.now();
    const zip = buildArchive(fixture({ food: { dailyLogs: days } }), {
      recipeNames: extra.recipeNames,
      workoutsCsv: ['Date', ...workoutRows].join('\r\n'),
    });
    const ms = performance.now() - started;
    expect(ms).toBeLessThan(3000);
    expect(zip.byteLength).toBeLessThan(2 * 1024 * 1024);
  });
});

describe('archiveFilename', () => {
  it('is dated with the user’s own day, like the JSON export', () => {
    expect(archiveFilename('2026-10-22')).toBe('chefer-export-2026-10-22.zip');
  });
});
