import { formatKcal } from '@chefer/utils';

// ─── Plan miss + re-plan helpers (UX-11 T-11.3) ────────────────────────────────
// Pure rules behind the plan-miss sheet and the re-plan banner, kept out of the
// components so they are unit-tested on their own.

export type MissDirection = 'under' | 'over';

/** A day's kcal against its target: which way it missed, or null when it sits in the band. */
export function missDirection(kcal: number, target: number, band = 0.15): MissDirection | null {
  if (!(target > 0)) return null;
  if (Math.abs(kcal - target) / target <= band) return null;
  return kcal < target ? 'under' : 'over';
}

/** The `mealPlan.scaleDay` factor that lands a day on its target, clamped to the API's 0.75–1.5×. */
export function scaleFactorFor(kcal: number, target: number): number {
  if (!(kcal > 0) || !(target > 0)) return 1;
  const raw = target / kcal;
  return Math.round(Math.min(1.5, Math.max(0.75, raw)) * 100) / 100;
}

/** `Add a snack` is offered on an under-target day, never on a weight-loss goal, and not for an unknown goal. */
export function canOfferSnack(direction: MissDirection, goal: string | null | undefined): boolean {
  if (direction !== 'under') return false;
  if (goal === null || goal === undefined || goal === '') return false;
  return goal !== 'LOSE_WEIGHT';
}

/** The plan's calorie target has drifted from the live one by at least 5 %. */
export function targetDrifted(planned: number | undefined, live: number | undefined): boolean {
  if (!planned || !live || planned <= 0) return false;
  return Math.abs(live - planned) / planned >= 0.05;
}

const REPLAN_KEY = 'chefer.replan-dismissed.';

/** Whether the re-plan banner was dismissed for this plan (localStorage may be unavailable). */
export function isReplanDismissed(planId: string): boolean {
  try {
    return window.localStorage.getItem(REPLAN_KEY + planId) === '1';
  } catch {
    return false;
  }
}

export function dismissReplan(planId: string): void {
  try {
    window.localStorage.setItem(REPLAN_KEY + planId, '1');
  } catch {
    // Storage blocked — the banner just comes back next visit.
  }
}

const CHANGES_KEY = 'chefer.premium-changes-dismissed.';

export function isChangesDismissed(planId: string): boolean {
  try {
    return window.localStorage.getItem(CHANGES_KEY + planId) === '1';
  } catch {
    return false;
  }
}

export function dismissChanges(planId: string): void {
  try {
    window.localStorage.setItem(CHANGES_KEY + planId, '1');
  } catch {
    // Storage blocked — the card just stays until the page is left.
  }
}

// ─── `What Premium changed` miss lines (T-10.7) ────────────────────────────────

export interface PlanMiss {
  dayOfWeek: number;
  deltaKcal: number;
}

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function missLine(group: readonly PlanMiss[], word: 'under' | 'over'): string | null {
  if (group.length === 0) return null;
  const mean = group.reduce((sum, m) => sum + Math.abs(m.deltaKcal), 0) / group.length;
  const about = Math.max(10, Math.round(mean / 10) * 10);
  const days = joinNames(group.map((m) => SHORT[m.dayOfWeek] ?? String(m.dayOfWeek)));
  return `${days} ${group.length === 1 ? 'is' : 'are'} about ${formatKcal(about)} kcal ${word}`;
}

/** `Thu and Sat are about 300 kcal under` — one line per direction, in weekday order. */
export function missLines(misses: readonly PlanMiss[]): { text: string; firstDay: number }[] {
  const sorted = [...misses].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const under = sorted.filter((m) => m.deltaKcal < 0);
  const over = sorted.filter((m) => m.deltaKcal > 0);
  const out: { text: string; firstDay: number }[] = [];
  const u = missLine(under, 'under');
  const o = missLine(over, 'over');
  if (u && under[0]) out.push({ text: u, firstDay: under[0].dayOfWeek });
  if (o && over[0]) out.push({ text: o, firstDay: over[0].dayOfWeek });
  return out;
}
