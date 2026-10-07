// FB7-11 / FB7-04: the Plan page's week-options and meal-menu copy, shared by
// mobile and web so both say the same thing.

export const PLAN_WEEK_COPY = {
  /** The one button that replaces Regenerate + Rebalance. */
  optionsLabel: 'Week options',
  optionsTitle: 'Week options',
  regenerate: {
    title: 'New meal plan for this week',
    description: 'Keeps the meals you pinned.',
  },
  rebalance: {
    title: 'Rebalance my week',
    description: 'Swaps up to 2 upcoming meals to bring your week back on target.',
    checking: 'Checking your week…',
    /** Shown on the disabled row when the preview found nothing to fix. */
    onTrack: 'Your week is already on target, so there is nothing to swap.',
    error: 'Couldn’t check your week just now. Try again.',
  },
} as const;

/** The "…" menu on a plan meal. */
export const PLAN_MEAL_MENU_COPY = {
  moreActions: (mealName: string): string => `More actions for ${mealName}`,
  swap: (mealName: string): string => `Replace ${mealName}`,
  pin: 'Keep in next plans',
  pinHint: 'Keeps this meal when you make a new plan for the week',
  unpin: 'Stop keeping in next plans',
  unpinHint: 'A new plan can replace this meal again',
  addSide: 'Add a side dish',
  addSideHint: 'Add a second dish to this meal',
  removeSide: 'Remove from plan',
  removeSideHint: 'Takes this dish off the plan',
  pinnedBadge: 'Your pick',
  /** The compact side card's badge. */
  sideBadge: '+ side',
  removed: (name: string): string => `Removed ${name}`,
  added: (name: string): string => `Added ${name} as a side`,
  groupTotal: (mealType: string): string =>
    `${mealType.charAt(0).toUpperCase()}${mealType.slice(1)} total`,
  /** The group header's dish count: "2 dishes". */
  dishCount: (n: number): string => `${n} ${n === 1 ? 'dish' : 'dishes'}`,
} as const;
