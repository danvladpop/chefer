import type {
  PlanSlotMealType,
  ProgressEventKind,
  QuestKind,
  ReceiptMeta,
  TodaysThreeQuest,
} from '@chefer/types';
import { XP } from './xp-table';

// ─── Today's three (idea 15) ──────────────────────────────────────────────────
// Up to three things that are real today. No quest is ever about eating less.

const QUEST_XP: Record<QuestKind, number> = {
  WORKOUT: XP.WORKOUT_DONE,
  COOK: XP.COOKED_AT_HOME,
  LOG_SLOT: XP.LOGGED + XP.ON_PLAN,
  PROTEIN: XP.PROTEIN_GOAL,
  SHOP: XP.SHOP_DONE,
  LOG_ANY: XP.LOGGED,
};

const LOG_ORDER: readonly PlanSlotMealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

type PlannedSlot = {
  mealType: PlanSlotMealType;
  slotIndex: number;
  recipeId?: string;
  recipeName?: string;
  logged: boolean;
};

/** Up to three quests, none done yet, in priority order. Pure: same input, same three. */
export function pickTodaysThree(input: {
  localDate: string;
  plannedSlots: PlannedSlot[];
  proteinTargetG: number | null;
  showProtein: boolean;
  workoutPlannedToday: boolean;
  shoppingUnchecked: number;
  quiet: boolean;
}): TodaysThreeQuest[] {
  const eligible: TodaysThreeQuest[] = [];

  if (input.workoutPlannedToday) {
    eligible.push({ id: 'WORKOUT', kind: 'WORKOUT', xp: QUEST_XP.WORKOUT, done: false });
  }

  const unlogged = input.plannedSlots.filter((s) => !s.logged);
  const cookSlot =
    unlogged.find((s) => s.mealType === 'dinner' && s.recipeId) ??
    unlogged.find((s) => s.mealType === 'lunch' && s.recipeId);
  if (cookSlot?.recipeId) {
    eligible.push({
      id: `COOK:${cookSlot.mealType}`,
      kind: 'COOK',
      xp: QUEST_XP.COOK,
      mealType: cookSlot.mealType,
      recipeId: cookSlot.recipeId,
      ...(cookSlot.recipeName !== undefined ? { recipeName: cookSlot.recipeName } : {}),
      done: false,
    });
  }

  const logSlot = unlogged
    .filter((s) => s !== cookSlot)
    .sort(
      (a, b) =>
        LOG_ORDER.indexOf(a.mealType) - LOG_ORDER.indexOf(b.mealType) || a.slotIndex - b.slotIndex,
    )[0];
  if (logSlot) {
    eligible.push({
      id: `LOG_SLOT:${logSlot.mealType}`,
      kind: 'LOG_SLOT',
      xp: QUEST_XP.LOG_SLOT,
      mealType: logSlot.mealType,
      done: false,
    });
  }

  if (input.showProtein && input.proteinTargetG && input.proteinTargetG > 0 && !input.quiet) {
    eligible.push({
      id: 'PROTEIN',
      kind: 'PROTEIN',
      xp: QUEST_XP.PROTEIN,
      proteinTargetG: Math.round(input.proteinTargetG),
      done: false,
    });
  }

  if (input.shoppingUnchecked > 0) {
    eligible.push({ id: 'SHOP', kind: 'SHOP', xp: QUEST_XP.SHOP, done: false });
  }

  eligible.push({ id: 'LOG_ANY', kind: 'LOG_ANY', xp: QUEST_XP.LOG_ANY, done: false });

  const seen = new Set<string>();
  const picked: TodaysThreeQuest[] = [];
  for (const quest of eligible) {
    if (seen.has(quest.id)) continue;
    seen.add(quest.id);
    picked.push(quest);
    if (picked.length === 3) break;
  }
  return picked;
}

/** A quest is done when the matching ledger event exists for that day. */
export function questDone(
  quest: Pick<TodaysThreeQuest, 'kind' | 'mealType'>,
  dayEvents: { kind: ProgressEventKind; meta: ReceiptMeta }[],
): boolean {
  switch (quest.kind) {
    case 'LOG_SLOT':
      return dayEvents.some((e) => e.kind === 'MEAL_LOGGED' && e.meta.mealType === quest.mealType);
    case 'COOK':
      return dayEvents.some((e) => e.kind === 'COOK_FINISHED');
    case 'PROTEIN':
      return dayEvents.some((e) => e.kind === 'PROTEIN_GOAL');
    case 'WORKOUT':
      return dayEvents.some((e) => e.kind === 'WORKOUT_COMPLETED');
    case 'SHOP':
      return dayEvents.some((e) => e.kind === 'SHOP_DONE');
    case 'LOG_ANY':
      return dayEvents.some((e) => e.kind === 'MEAL_LOGGED');
  }
}
