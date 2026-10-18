// ─── Shell v2 routes (mobile UX revamp, phase 1) ────────────────────────────
// The new shell's one tab bar (Shop · Meals · Today · Train · You, plan:
// "Target navigation") and the map from the old Food|Gym URLs to it. The old
// tab groups stay in the app untouched; while the new shell is on, their
// layouts send every visit (a push from an old screen, a notification, a
// deep link) to the new home of the same screen, via `shellV2PathFor`.

export type ShellTab = 'home' | 'plan' | 'shop' | 'train' | 'you';

const OLD_TO_NEW: Readonly<Record<string, string>> = {
  '/': '/home',
  '/meal-plan': '/plan',
  '/shopping-list': '/shop',
  '/recipes': '/cookbook',
  '/more': '/you',
  '/today': '/train',
  '/routine': '/training/routine',
  '/exercises': '/training/exercises',
  '/stats': '/training/stats',
  '/gym-more': '/you',
};

/** Where an old tab URL lives in the new shell (null when it isn't an old tab). */
export function shellV2PathFor(pathname: string): string | null {
  return OLD_TO_NEW[pathname] ?? null;
}

const NEW_TAB_PATHS: ReadonlySet<string> = new Set(['/home', '/plan', '/shop', '/train', '/you']);

/** Whether a pathname is one of the new shell's own tabs. */
export function isShellV2TabPath(pathname: string): boolean {
  return NEW_TAB_PATHS.has(pathname);
}

// ─── Trainer mode (docs/prd-2026-10/trainer-mode.md §5.2) ─────────────────────
// The second shell's tab bar: Schedule · Clients · Today · Workouts · You
// (`app/(trainer)`). Its tab URLs share names with other groups (`/today`,
// `/you`), so code always navigates with the explicit group.

export type TrainerTab = 'schedule' | 'clients' | 'today' | 'workouts' | 'you';

const OLD_TO_TRAINER: Readonly<Record<string, string>> = {
  '/trainer': '/(trainer)/clients',
};

/** Where an old Trainer tools URL lives once trainer mode is available (null when it has no new home). */
export function trainerModePathFor(pathname: string): string | null {
  return OLD_TO_TRAINER[pathname] ?? null;
}
