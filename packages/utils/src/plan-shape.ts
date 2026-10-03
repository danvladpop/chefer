import {
  LEGACY_PLAN_DAYS,
  LEGACY_PLAN_SLOTS,
  planShapeSchema,
  type PlanShape,
  type PlanSlot,
} from '@chefer/types';

// ─── Plan shape helpers (§2.3, T-07.1) ─────────────────────────────────────────

const SLOT_LABEL: Readonly<Record<PlanSlot, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Stored `[]` means "legacy": breakfast/lunch/dinner, every day, no cap. */
export function resolvePlanSlots(stored: readonly PlanSlot[]): readonly PlanSlot[] {
  return stored.length > 0 ? stored : LEGACY_PLAN_SLOTS;
}

export function resolvePlanDays(stored: readonly number[]): readonly number[] {
  return stored.length > 0 ? stored : LEGACY_PLAN_DAYS;
}

/** Whether a shape is well-formed (delegates to the zod schema). */
export function isValidPlanShape(shape: unknown): shape is PlanShape {
  return planShapeSchema.safeParse(shape).success;
}

/**
 * A one-line human summary, e.g. "Breakfast, lunch, dinner · every day" or
 * "Lunch, dinner · Mon–Fri · 30 min or less · cooking for 2".
 */
export function planShapeSummary(shape: PlanShape, tableSize?: number | null): string {
  const slots = shape.slots.map((slot) => SLOT_LABEL[slot]).join(', ');
  const days = daysLabel(shape.days);
  const parts = [slots, days];
  if (shape.timeCapMins != null) {
    parts.push(`${shape.timeCapMins} min or less${shape.weekendNoLimit ? ' (weekdays)' : ''}`);
  }
  // UX-PLAN-12: with household members the table (you + them) is who the week
  // is for — the stored "Just me / Two of us" is only the fallback without one.
  const table = tableSize != null && tableSize >= 2 ? tableSize : shape.cookingFor;
  if (table != null) {
    parts.push(`cooking for ${table}`);
  }
  return parts.join(' · ');
}

/**
 * UX-PLAN-12: the read-only "Cooking for" line when the household has members
 * — `You + 2` — and who they are (`Mia, Noah`; more than three: `Mia, Noah, Ava +2`).
 * Null when it is just the user.
 */
export function householdTableSummary(
  members: readonly { name: string }[],
): { text: string; names: string } | null {
  if (members.length === 0) return null;
  const names = members.map((m) => m.name.trim()).filter(Boolean);
  const shown = names.slice(0, 3).join(', ');
  const rest = names.length - 3;
  return {
    text: `You + ${members.length}`,
    names: rest > 0 ? `${shown} +${rest}` : shown,
  };
}

const MEAL_WORD_PLURAL: Readonly<Record<PlanSlot, string>> = {
  breakfast: 'breakfasts',
  lunch: 'lunches',
  dinner: 'dinners',
  snack: 'snacks',
};

/**
 * The empty-week/settings-sheet button label that names the job (UX-07 AC3):
 * `Plan {n} {meal words}` for a single-meal shape (e.g. "Plan 4 dinners"),
 * `Plan my week` for the legacy default (every meal, every day) and any
 * other combination we don't have a tighter phrase for yet.
 */
export function planButtonLabel(shape: Pick<PlanShape, 'slots' | 'days'>): string {
  const slots = resolvePlanSlots(shape.slots);
  const days = resolvePlanDays(shape.days);
  if (slots.length === 1) {
    const slot = slots[0];
    if (slot) {
      return `Plan ${days.length} ${MEAL_WORD_PLURAL[slot]}`;
    }
  }
  return 'Plan my week';
}

function daysLabel(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'every day';
  if (sorted.length === 5 && sorted.every((d, i) => d === i)) return 'Mon–Fri';
  if (sorted.length === 2 && sorted[0] === 5 && sorted[1] === 6) return 'weekends';
  return sorted.map((d) => DAY_LABEL[d]).join(', ');
}
