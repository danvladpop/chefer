// ─── Following copy still read outside the Following screens ───────────────────
// The Following screens read the `friends` catalog in @chefer/i18n (English and
// Romanian). What stays here is English text the API sends itself (TRPCError
// messages, the stand-ins for a name the word filter rejected) or that code
// outside the Following screens still reads until its own surface moves to the
// catalog (recipe screens, add-to-week, privacy history). The word "Friends"
// must never appear in a string (friends-copy.test.ts deep-scans every string
// and every function's output and fails the build if it does).
//
// Apostrophes and quotes are typographic (’ “ ”), as in the UX spec.

/** 2150 → "2,150" (no Intl: Hermes' locale support varies). */
function num(n: number | string): string {
  const s = String(n);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const FRIENDS_COPY = {
  nav: { label: 'Following' },

  intro: {
    /** Server BAD_REQUEST with `data.textRejected: 'name'`. */
    nameRejected: 'Please choose a different name. Some words aren’t allowed on Chefer profiles.',
  },

  notAvailable: {
    title: 'Profile not available',
  },

  relation: {
    error: 'Couldn’t update. Try again.',
  },

  search: {
    rateLimited: 'Too many searches. Try again in a minute.',
  },

  food: {
    hiddenRecipe: 'Hidden recipe',
  },

  recipe: {
    by: (name: string): string => `By ${name}`,
    byLabel: (name: string): string => `By ${name}. Open profile`,
    from: (first: string): string => `From ${first}`,
    fromGone: 'From another Chefer cook',
    addToWeek: 'Add to my week',
    report: 'Report recipe',
    hidden: {
      title: 'Hidden from people who follow you',
      reports: 'Several people reported this recipe, so it’s no longer shown to others.',
      filter:
        'Some words in its name or description aren’t allowed on shared recipes. Edit it to share it again.',
    },
    /** Server BAD_REQUEST with `data.textRejected: 'recipe'` (create, edit, import). */
    textRejected:
      'Some words in this recipe’s name or description aren’t allowed on shared recipes. Change them, or turn off recipe sharing.',
  },

  addToWeek: {
    title: 'Add to your week',
    eyebrow: (recipe: string, kcal: number): string => `${recipe} · ${num(kcal)} kcal`,
    thisWeek: 'This week',
    nextWeek: 'Next week',
    addHere: 'Add here',
    /** FB7-04: adding to a meal type that already has a dish puts the recipe next to it. */
    addAsSide: 'Add as a side',
    replace: 'Replace',
    /** FB7-04: the slot row's label (the confirm button keeps `replace`). */
    replaceThisMeal: 'Replace this meal',
    /** `day` and `meal` are pre-formatted, e.g. "Tue" / "lunch". */
    cta: (day: string, meal: string): string => `Add to ${day} ${meal}`,
    /** Also the server's NOT_FOUND message, matched as sent by the clients. */
    noPlan: 'You don’t have a plan for this week yet.',
    makePlan: 'Make a plan',
    replaceTitle: (meal: string): string => `Replace ${meal}?`,
    replaceBody: (recipe: string, day: string, meal: string): string =>
      `${recipe} goes on ${day} ${meal} instead.`,
    done: (day: string, meal: string): string => `Added to ${day} ${meal}`,
    useAnyway: 'Use anyway',
  },

  gym: {
    routine: 'Routine',
    /**
     * Neutral stand-ins the server sends when a routine, day, workout or custom
     * exercise name trips the word filter (F3.1 — free text shown to followers).
     */
    filtered: {
      day: (n: number): string => `Day ${num(n)}`,
      workout: 'Workout',
      exercise: 'Custom exercise',
    },
  },

  settings: {
    forcedPrivate:
      'Your profile is private because several people reported it. It can’t be made public.',
  },

  /** Privacy › consent history rows for `ConsentKind.SOCIAL_SHARING` (PRD §14). */
  consent: {
    label: (on: boolean): string => `Following and sharing: ${on ? 'on' : 'off'}`,
  },

  privacyRow: {
    label: 'Profile visibility',
    private: 'Private',
    public: 'Public',
    off: 'Off',
  },

  unavailable: 'Following isn’t available right now.',

  /**
   * Server error messages (the `message` of a friends.* TRPCError). The app
   * shows them as is when it has nothing more specific, so they follow the
   * same copy rules as the rest of the deck.
   */
  server: {
    notActivated: 'Turn on Following to use this.',
    locked: 'Follow this person to see this.',
    notShared: 'This person isn’t sharing this right now.',
    followSelf: 'You can’t follow yourself.',
    blockSelf: 'You can’t block yourself.',
    reportSelf: 'You can’t report yourself.',
    requestCap: 'You’ve asked to follow this person several times this week. Try again later.',
    reportCap: 'Too many reports today. Please try again tomorrow.',
    recipeNotAvailable: 'Recipe not available.',
    tooManyAttempts: 'Too many attempts. Please wait a few minutes and try again.',
  },
} as const;

export type FriendsCopy = typeof FRIENDS_COPY;
