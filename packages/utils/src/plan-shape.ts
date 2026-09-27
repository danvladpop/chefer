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
export function planShapeSummary(shape: PlanShape): string {
  const slots = shape.slots.map((slot) => SLOT_LABEL[slot]).join(', ');
  const days = daysLabel(shape.days);
  const parts = [slots, days];
  if (shape.timeCapMins != null) {
    parts.push(`${shape.timeCapMins} min or less${shape.weekendNoLimit ? ' (weekdays)' : ''}`);
  }
  if (shape.cookingFor != null) {
    parts.push(`cooking for ${shape.cookingFor}`);
  }
  return parts.join(' · ');
}

function daysLabel(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'every day';
  if (sorted.length === 5 && sorted.every((d, i) => d === i)) return 'Mon–Fri';
  if (sorted.length === 2 && sorted[0] === 5 && sorted[1] === 6) return 'weekends';
  return sorted.map((d) => DAY_LABEL[d]).join(', ');
}
