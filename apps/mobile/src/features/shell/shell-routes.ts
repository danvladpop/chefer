// ─── Shell v2 routes (mobile UX revamp, phase 1) ────────────────────────────
// The new shell's one tab bar (Today · Plan · Shop · Train · You, plan:
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
