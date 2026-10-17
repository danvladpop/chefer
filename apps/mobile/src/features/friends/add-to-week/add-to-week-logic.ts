import { FRIENDS_COPY } from '@chefer/types';
import {
  canPickNextWeek,
  dayOfMonth,
  defaultDay,
  isPastDay,
  localWeekday,
  NEXT_WEEK_FROM_WEEKDAY,
} from '@chefer/utils';
import { friendsErrorData } from '../api/friends-errors';

// ─── Add to my week: the client-side rules (UX §9.5, PRD FR-17.4) ─────────────
// Pure, so the sheet's rules are testable without rendering:
//   • this week always; next week only from Thursday on (viewer's local time);
//   • past days of this week are disabled;
//   • one row per meal slot of the chosen day — a filled slot is `Replace`
//     (one row per meal in it), an empty one is `Add here`.
// Weekdays are Mon-first (0 = Monday … 6 = Sunday), as in the plan.

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_ORDER: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// The pure day rules (Thursday gate, past days, "today / Monday") live in
// @chefer/utils, shared with the web.
export { canPickNextWeek, dayOfMonth, defaultDay, isPastDay, localWeekday, NEXT_WEEK_FROM_WEEKDAY };

export type SlotRow = {
  key: string;
  mealType: MealType;
  mode: 'add' | 'replace';
  /** Index in `day.meals` (the API's slot index) for a replace. */
  slotIndex: number | null;
  /** The meal currently there (a replace). */
  currentName: string | null;
  /**
   * FB7-04: an `add` row for a meal type that already has a dish — the recipe
   * goes next to it as a side ("Add as a side"), not into an empty slot.
   */
  side?: boolean;
};

type PlanForSlots = {
  days: readonly {
    dayOfWeek: number;
    meals: readonly { type: string; recipe: { name: string } }[];
  }[];
};

function isMealType(value: string): value is MealType {
  return (MEAL_ORDER as readonly string[]).includes(value);
}

/**
 * The rows for one day: every slot type the viewer plans (`getShape.slots`)
 * plus any type already on that day, in meal order.
 */
export function slotRows(
  plan: PlanForSlots,
  dayOfWeek: number,
  shapeSlots: readonly string[],
): SlotRow[] {
  const meals = plan.days.find((d) => d.dayOfWeek === dayOfWeek)?.meals ?? [];
  const types = new Set<MealType>();
  for (const t of shapeSlots) if (isMealType(t)) types.add(t);
  for (const m of meals) if (isMealType(m.type)) types.add(m.type);
  const rows: SlotRow[] = [];
  for (const type of MEAL_ORDER) {
    if (!types.has(type)) continue;
    const filled = meals.map((m, index) => ({ m, index })).filter(({ m }) => m.type === type);
    if (filled.length === 0) {
      rows.push({
        key: `${type}-add`,
        mealType: type,
        mode: 'add',
        slotIndex: null,
        currentName: null,
      });
      continue;
    }
    for (const { m, index } of filled) {
      rows.push({
        key: `${type}-${index}`,
        mealType: type,
        mode: 'replace',
        slotIndex: index,
        currentName: m.recipe.name,
      });
    }
    // FB7-04: a second dish for the same meal — a side next to the main.
    rows.push({
      key: `${type}-side`,
      mealType: type,
      mode: 'add',
      slotIndex: null,
      currentName: null,
      side: true,
    });
  }
  return rows;
}

// ─── Reading `friends.addRecipeToWeek` failures ───────────────────────────────

export type AddFailure =
  | { kind: 'conflict'; message: string; canAcknowledge: boolean }
  | { kind: 'noPlan' }
  | { kind: 'error' };

function messageOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : '';
}

/**
 * A safety conflict with the viewer's table → the conflict line (+ `Use
 * anyway` when the server will honour `acknowledgeConflict`, i.e. it sent
 * `data.unsafeForTable`); no plan for that week → the `Make a plan` state;
 * anything else → a generic retry line.
 */
export function readAddFailure(error: unknown): AddFailure {
  const data = friendsErrorData(error);
  const message = messageOf(error);
  if (data.unsafeForTable || message.startsWith('UNSAFE_FOR_TABLE')) {
    return {
      kind: 'conflict',
      message: message.replace(/^UNSAFE_FOR_TABLE:\s*/, ''),
      canAcknowledge: Boolean(data.unsafeForTable),
    };
  }
  if (message === FRIENDS_COPY.addToWeek.noPlan) return { kind: 'noPlan' };
  return { kind: 'error' };
}
