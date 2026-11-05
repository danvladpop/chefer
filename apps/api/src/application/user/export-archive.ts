import { strToU8, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import { LB_PER_KG } from '@chefer/types';
import { toCsv, WEEKDAY_SHORT, type CsvCell } from '@chefer/utils';
import type { AccountData } from './account-data.service.js';

// ─── Full data export: the ZIP (G1, market review 2026-10) ────────────────────
// "You can always take your data with you." Mealime shut down on 2026-10-21
// and deleted every library with no export; this archive is what a user keeps.
//
//   chefer-data.json   everything (the `user.exportData` object, unchanged)
//   README.txt         what each file is, in plain words
//   csv/*.csv          the parts people open in a spreadsheet
//
// The CSVs are built from the SAME object as the JSON (`collectAccountData`),
// so the two can never disagree. Pure: no I/O here, so every section is
// tested without a database (export-archive.test.ts).
//
// Adding a section (e.g. lane D's body measurements): add its rows to
// `collectAccountData`, then one entry to CSV_SECTIONS below. Nothing else
// changes — the README lists every section automatically.

export type ExtraArchiveInput = {
  /** recipe id → name, for plans and logs, which store ids only. */
  recipeNames: ReadonlyMap<string, string>;
  /** The gym history CSV (`gym.export.csv`), reused as-is. */
  workoutsCsv: string;
};

type Build = (data: AccountData, extra: ExtraArchiveInput) => string;
type CsvSection = { file: string; about: string; build: Build };

/** A plain table section: a header and one array per row. */
const table =
  (header: string[], rows: (data: AccountData, extra: ExtraArchiveInput) => CsvCell[][]): Build =>
  (data, extra) =>
    toCsv(header, rows(data, extra));

// The JSON columns, parsed at this boundary. Loose on purpose: an old or
// odd row loses a cell, never the whole export.
const text = z.string().catch('');
const maybeNum = z.number().finite().nullable().catch(null);
const loggedEntrySchema = z.object({
  recipeId: z.string().optional().catch(undefined),
  custom: z.object({ name: text }).optional().catch(undefined),
  mealType: text,
  portionMultiplier: maybeNum,
  kcal: maybeNum,
  protein: maybeNum,
  carbs: maybeNum,
  fat: maybeNum,
});
const planMealSchema = z.object({ type: text, recipeId: text });
const ingredientSchema = z.object({ name: text, quantity: maybeNum, unit: text });
const nutritionSchema = z
  .object({ calories: maybeNum, protein: maybeNum, carbs: maybeNum, fat: maybeNum })
  .catch({ calories: null, protein: null, carbs: null, fat: null });
const targetFieldSchema = z.object({ field: text, before: z.unknown(), after: z.unknown() });
const shoppingItemSchema = z.object({
  key: text,
  ingredientName: text,
  name: text,
  quantity: z.union([z.string(), z.number()]).nullable().catch(null),
  unit: text,
});

/** The elements of a JSON array that parse; anything else is skipped. */
function parsedRows<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): z.output<S>[] => {
    const r = schema.safeParse(v);
    return r.success ? [r.data as z.output<S>] : [];
  });
}

const iso = (d: Date | string | null | undefined): string =>
  d == null ? '' : typeof d === 'string' ? d : d.toISOString();
const isoDate = (d: Date | string | null | undefined): string => iso(d).slice(0, 10);
const round = (n: number | null | undefined, dp = 1): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp;
const cell = (value: unknown): CsvCell =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : value == null
      ? null
      : JSON.stringify(value);

/** An object's own fields as [section, setting, value] rows (ids, owners and timestamps left out). */
function settingRows(section: string, obj: object | null): CsvCell[][] {
  if (!obj) return [];
  const skip = new Set(['id', 'userId', 'createdAt', 'updatedAt']);
  return Object.entries(obj)
    .filter(([key, value]) => !skip.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => [
      section,
      key,
      Array.isArray(value)
        ? value.join('; ')
        : value instanceof Date
          ? value.toISOString()
          : cell(value),
    ]);
}

function nutrition(info: unknown): CsvCell[] {
  const n = nutritionSchema.parse(info ?? {});
  return [round(n.calories, 0), round(n.protein), round(n.carbs), round(n.fat)];
}

const ingredientText = (ingredients: unknown): string =>
  parsedRows(ingredientSchema, ingredients)
    .map((i) => [i.quantity ?? '', i.unit, i.name].join(' ').trim())
    .join('; ');

type RecipeLike =
  | AccountData['food']['recipes'][number]
  | AccountData['food']['savedRecipes'][number];

const recipeRow = (r: RecipeLike, kind: 'yours' | 'saved'): CsvCell[] => [
  r.name,
  kind,
  r.servings,
  r.prepTimeMins,
  r.cookTimeMins,
  ...nutrition(r.nutritionInfo),
  ingredientText(r.ingredients),
  r.instructions.map((step, i) => `${i + 1}. ${step}`).join(' '),
  r.sourceUrl,
];

const CSV_SECTIONS: CsvSection[] = [
  {
    file: 'food-log.csv',
    about: 'Everything you logged, one row per food: date, meal, calories and macros.',
    build: table(
      [
        'Date',
        'Meal',
        'Food',
        'Portion',
        'Calories (kcal)',
        'Protein (g)',
        'Carbs (g)',
        'Fat (g)',
        'Kind',
      ],
      (data, { recipeNames }) =>
        [...data.food.dailyLogs]
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .flatMap((log) =>
            parsedRows(loggedEntrySchema, log.loggedMeals).map((entry) => {
              const recipeId = entry.recipeId ?? '';
              return [
                isoDate(log.date),
                entry.mealType,
                entry.custom ? entry.custom.name : (recipeNames.get(recipeId) ?? recipeId),
                entry.portionMultiplier,
                round(entry.kcal, 0),
                round(entry.protein),
                round(entry.carbs),
                round(entry.fat),
                entry.custom ? 'custom' : 'recipe',
              ];
            }),
          ),
    ),
  },
  {
    file: 'weights.csv',
    about: 'Your weigh-ins.',
    build: table(['Recorded at', 'Weight (kg)', 'Weight (lb)'], (data) =>
      [...data.food.weightEntries]
        .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
        .map((w) => [iso(w.recordedAt), round(w.weightKg, 2), round(w.weightKg * LB_PER_KG, 1)]),
    ),
  },
  {
    file: 'profile-and-targets.csv',
    about: 'Your body details, daily targets, goal and food and gym preferences.',
    build: table(['Section', 'Setting', 'Value'], (data) => [
      ...settingRows('profile', data.food.chefProfile),
      ...settingRows('food preferences', data.food.dietaryPreferences),
      ...settingRows('gym', data.gym.gymProfile),
    ]),
  },
  {
    file: 'target-changes.csv',
    about: 'Every time your targets changed, why, and what you chose.',
    build: table(['Date', 'Kind', 'Reason', 'Field', 'Before', 'After', 'Resolution'], (data) =>
      data.food.targetChanges.flatMap((change) => {
        const base: CsvCell[] = [iso(change.createdAt), change.kind, change.reason];
        const fields = parsedRows(targetFieldSchema, change.fields);
        if (fields.length === 0) return [[...base, '', '', '', change.resolution]];
        return fields.map((f) => [
          ...base,
          f.field,
          cell(f.before),
          cell(f.after),
          change.resolution,
        ]);
      }),
    ),
  },
  {
    file: 'meal-plans.csv',
    about: 'Your weekly meal plans and saved weeks ("My weeks"), one row per meal.',
    build: table(
      ['Week starting', 'Saved week', 'Day', 'Meal', 'Recipe'],
      (data, { recipeNames }) =>
        [...data.food.mealPlans]
          .sort((a, b) => a.weekStartDate.getTime() - b.weekStartDate.getTime())
          .flatMap((plan) =>
            [...plan.days]
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .flatMap((day) =>
                parsedRows(planMealSchema, day.meals).map((meal) => [
                  plan.isTemplate ? '' : isoDate(plan.weekStartDate),
                  plan.isTemplate ? (plan.name ?? 'Saved week') : '',
                  WEEKDAY_SHORT[day.dayOfWeek] ?? String(day.dayOfWeek),
                  meal.type,
                  recipeNames.get(meal.recipeId) ?? meal.recipeId,
                ]),
              ),
          ),
    ),
  },
  {
    file: 'recipes.csv',
    about: 'Recipes you made or imported, and recipes you saved.',
    build: table(
      [
        'Recipe',
        'Yours or saved',
        'Servings',
        'Prep (min)',
        'Cook (min)',
        'Calories (kcal)',
        'Protein (g)',
        'Carbs (g)',
        'Fat (g)',
        'Ingredients',
        'Steps',
        'Source link',
      ],
      (data) => {
        const own = new Set(data.food.recipes.map((r) => r.id));
        return [
          ...data.food.recipes.map((r) => recipeRow(r, 'yours')),
          ...data.food.savedRecipes.filter((r) => !own.has(r.id)).map((r) => recipeRow(r, 'saved')),
        ];
      },
    ),
  },
  {
    file: 'shopping-lists.csv',
    about: 'Your stored shopping lists, with what you ticked off.',
    build: table(
      ['Week starting', 'Item', 'Quantity', 'Unit', 'Ticked', 'Added by you'],
      (data) => {
        const plans = new Map(data.food.mealPlans.map((p) => [p.id, p]));
        return data.food.shoppingLists.flatMap((list) => {
          const plan = plans.get(list.planId);
          const week = !plan
            ? ''
            : plan.isTemplate
              ? (plan.name ?? 'Saved week')
              : isoDate(plan.weekStartDate);
          const checked = new Set(list.checkedKeys);
          const row = (i: z.infer<typeof shoppingItemSchema>, custom: boolean): CsvCell[] => [
            week,
            i.ingredientName || i.name,
            i.quantity,
            i.unit,
            checked.has(i.key),
            custom,
          ];
          return [
            ...parsedRows(shoppingItemSchema, list.items).map((i) => row(i, false)),
            ...parsedRows(shoppingItemSchema, list.customItems).map((i) => row(i, true)),
          ];
        });
      },
    ),
  },
  {
    file: 'workouts.csv',
    about: 'Every completed workout, one row per set (same file as Gym → Export history).',
    build: (_data, { workoutsCsv }) => workoutsCsv,
  },
  {
    file: 'routines.csv',
    about: 'Your routines: each day, its exercises, sets, rep ranges and rest.',
    build: table(
      [
        'Routine',
        'Day',
        'Exercise #',
        'Exercise',
        'Sets',
        'Rep min',
        'Rep max',
        'Rest (s)',
        'Your note',
      ],
      (data) =>
        data.gym.routines.flatMap((routine) =>
          [...routine.days]
            .sort((a, b) => a.position - b.position)
            .flatMap((day) =>
              [...day.exercises]
                .sort((a, b) => a.position - b.position)
                .map((ex) => [
                  routine.name,
                  day.name,
                  ex.position + 1,
                  data.gym.exerciseNames[ex.exerciseId] ?? ex.exerciseId,
                  ex.sets,
                  ex.repMin,
                  ex.repMax,
                  ex.restSec,
                  ex.notes,
                ]),
            ),
        ),
    ),
  },
  {
    file: 'personal-records.csv',
    about: 'Your personal records (PRs), oldest first.',
    build: table(
      ['Date', 'Exercise', 'Record', 'Weight (kg)', 'Reps', 'Estimated 1RM (kg)', 'First logged'],
      (data) =>
        data.gym.personalRecords.map((pr) => [
          pr.localDate,
          pr.exercise,
          pr.kind === 'e1rm' ? 'estimated 1RM' : pr.kind,
          round(pr.weightKg, 2),
          pr.reps,
          round(pr.e1rmKg, 1),
          pr.isFirst,
        ]),
    ),
  },
  {
    file: 'kitchen-progress.csv',
    about: 'Kitchen progress: every XP you earned, what for, and on which day.',
    build: table(['Date', 'Earned for', 'XP', 'Recorded'], ({ progress }) =>
      progress.events.map((e) => [e.localDate, e.kind, e.xp, e.origin]),
    ),
  },
  {
    file: 'achievements.csv',
    about: 'The Kitchen progress badges you unlocked.',
    build: table(['Achievement', 'Tier', 'Unlocked at'], ({ progress }) =>
      progress.unlocks.map((u) => [u.achievementId, u.tier, iso(u.unlockedAt)]),
    ),
  },
  {
    file: 'cooking.csv',
    about: 'Every time you cooked along in cook mode.',
    build: table(['Date', 'Recipe', 'Started', 'Finished'], ({ progress }, { recipeNames }) =>
      progress.cookLogs.map((c) => [
        c.localDate,
        c.recipeId ? (recipeNames.get(c.recipeId) ?? c.recipeId) : '',
        iso(c.startedAt),
        iso(c.finishedAt),
      ]),
    ),
  },
  {
    file: 'following.csv',
    about: 'People you follow, your followers, open requests and blocks (names only).',
    build: table(['Relationship', 'Name', 'Since'], ({ social }) => [
      ...social.following.map((f) => ['you follow', f.name, iso(f.since)]),
      ...social.followers.map((f) => ['follows you', f.name, iso(f.since)]),
      ...social.pendingRequests.sent.map((f) => ['request sent', f.name, iso(f.requestedAt)]),
      ...social.pendingRequests.received.map((f) => [
        'request received',
        f.name,
        iso(f.requestedAt),
      ]),
      ...social.blocksMade.map((b) => ['blocked', b.name, iso(b.blockedAt)]),
    ]),
  },
  {
    file: 'coaching.csv',
    about: 'Your trainers, and your clients if you coach (names only).',
    build: table(['Relationship', 'Name', 'Since', 'Ended'], ({ coaching }) => [
      ...coaching.asClient.trainers.map((t) => [
        'your trainer',
        t.trainer,
        iso(t.since),
        iso(t.endedAt),
      ]),
      ...coaching.asTrainer.clients.map((c) => [
        'your client',
        c.client,
        iso(c.since),
        iso(c.endedAt),
      ]),
    ]),
  },
];

/** The CSV files of the archive, keyed by path (`csv/<file>`). */
export function buildCsvFiles(data: AccountData, extra: ExtraArchiveInput): Record<string, string> {
  return Object.fromEntries(
    CSV_SECTIONS.map((section) => [`csv/${section.file}`, section.build(data, extra)]),
  );
}

function readme(exportedAt: string): string {
  return [
    'Your Chefer data',
    '================',
    '',
    `Exported ${exportedAt}.`,
    '',
    'chefer-data.json',
    '  Everything Chefer stores about you, in one file. Other apps and scripts can read it.',
    '',
    'csv/ (open these in Excel, Numbers or Google Sheets)',
    ...CSV_SECTIONS.map((s) => `  ${s.file.padEnd(26)}${s.about}`),
    '',
    'Weights are in kilograms; some files add pounds alongside.',
    'Other people appear by display name only, never their email or account.',
    '',
  ].join('\r\n');
}

/** Named for the user's own day (`YYYY-MM-DD`), not the server's UTC one. */
export function archiveFilename(localDate: string): string {
  return `chefer-export-${localDate}.zip`;
}

/** The whole archive as ZIP bytes. */
export function buildArchive(data: AccountData, extra: ExtraArchiveInput): Uint8Array {
  const files: Zippable = {
    'README.txt': strToU8(readme(data.exportedAt)),
    'chefer-data.json': strToU8(JSON.stringify(data, null, 2)),
  };
  for (const [path, csv] of Object.entries(buildCsvFiles(data, extra))) {
    // A UTF-8 BOM so Excel opens accented names (ă, ș, é) correctly.
    files[path] = strToU8(`\uFEFF${csv}`);
  }
  return zipSync(files, { level: 6 });
}
