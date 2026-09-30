// ─── Following copy deck (docs/friends/ux-design.md §12) ────────────────────────
// Every user-visible string of the Following feature lives here, so a copy
// change is one edit and a test can scan the lot. The code name is `friends`;
// the user-facing word is "Following" — the word "Friends" must never appear in
// a string (friends-copy.test.ts deep-scans every string and every function's
// output and fails the build if it does).
//
// Structure: nested `as const` groups by screen/area. Strings that interpolate
// are small functions. Apostrophes and quotes are typographic (’ “ ”), as in
// the UX spec. Formatting of dates/relative times ("2h", "28 Sep") stays in the
// app; the functions here take the already-formatted fragment.

/** 2150 → "2,150" (no Intl: Hermes' locale support varies). */
function num(n: number | string): string {
  const s = String(n);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const FRIENDS_COPY = {
  common: {
    retry: 'Retry',
    tryAgain: 'Try again',
    undo: 'Undo',
    cancel: 'Cancel',
    goBack: 'Go back',
    followBack: 'Follow back',
  },

  nav: { label: 'Following' },

  // ─── §4 Turn on Following ────────────────────────────────────────────────────
  intro: {
    title: 'Follow people you cook and train with',
    body: 'See their week of meals, save their recipes and see their workouts.',
    nameHeading: 'How others will see you',
    firstName: 'First name',
    lastName: 'Last name',
    firstNameError: 'Add your first name',
    lastNameError: 'Add your last name',
    /** Server BAD_REQUEST with `data.textRejected: 'name'`. */
    nameRejected: 'Please choose a different name. Some words aren’t allowed on Chefer profiles.',
    whoHeading: 'Who can follow you',
    whatHeading: 'What followers see',
    what: {
      plan: 'This week’s meals, with calories and macros',
      recipes: 'Recipes you’ve written or imported',
      workouts: 'Your routine and last 7 days of workouts',
      change: 'You can change these any time.',
    },
    neverHeading: 'Never shared',
    never:
      'Your email, allergies and diets, body measurements and weight, targets, what you’ve logged, your household.',
    findable:
      'People who search your name can find you. Content that several people report is hidden automatically.',
    policy: 'Privacy Policy',
    cta: 'Turn on Following',
    notNow: 'Not now',
    error: 'Couldn’t turn on Following. Nothing has been changed.',
  },

  visibility: {
    private: 'Private — you approve each follower',
    public: 'Public — anyone on Chefer can follow you',
  },

  activated: {
    private: 'Following is on. Only people you approve can see your meals and workouts.',
    public: 'Following is on. People who follow you can see what you share.',
    filterHidden: (n: number): string =>
      `${n === 1 ? 'One' : num(n)} of your recipes won’t be shown to followers because of words in their name or description.`,
  },

  // ─── §5 Following home ───────────────────────────────────────────────────────
  home: {
    title: 'Following',
    searchPlaceholder: 'Search by name',
    searchLabel: 'Search people by name',
    requests: (n: number): string => `Requests · ${num(n)}`,
    seeAllRequests: (n: number): string => `See all ${num(n)}`,
    youFollow: (n: number): string => `You follow ${num(n)}`,
    followers: (n: number): string => `Followers ${num(n)}`,
    suggested: 'Suggested for you',
    seeAll: 'See all',
    activityLabel: (unread: number): string =>
      unread > 0 ? `Activity, ${num(unread)} new` : 'Activity',
    settingsLabel: 'Sharing and privacy',
    hideSuggestion: (name: string): string => `Hide suggestion ${name}`,
    sectionError: (section: 'requests' | 'list' | 'suggestions'): string =>
      `Couldn’t load ${
        section === 'requests' ? 'your requests' : section === 'list' ? 'this list' : 'suggestions'
      }.`,
  },

  empty: {
    youFollow: {
      title: 'Find people you know',
      body: 'Search by name, or follow someone below.',
    },
    followers: {
      title: 'No followers yet',
      body: 'Share Chefer with people you know so they can find you.',
    },
  },

  invite: {
    cta: 'Invite someone',
    card: {
      title: 'Chefer is better together',
      body: 'Invite someone you cook or train with.',
    },
    message: (myName: string, appLink: string): string =>
      `I’m using Chefer to plan meals and workouts. Follow me in Chefer: ${myName}. ${appLink}`,
  },

  reason: {
    mutualOne: (name: string): string => `Followed by ${name}`,
    mutualMany: (name: string, n: number): string =>
      `Followed by ${name} and ${num(n)} ${plural(n, 'other', 'others')}`,
    followsYou: 'Follows you',
    popular: 'Popular on Chefer',
  },

  requestRow: {
    accept: 'Accept',
    decline: 'Decline',
    acceptLabel: (name: string): string => `Accept ${name}`,
    declineLabel: (name: string): string => `Decline ${name}`,
  },

  accepted: {
    snackbar: (first: string): string => `${first} can now see your meals and workouts.`,
    action: 'Follow back',
  },

  // ─── §3.3 RelationButton ─────────────────────────────────────────────────────
  relation: {
    follow: 'Follow',
    followBack: 'Follow back',
    requested: 'Requested',
    following: 'Following',
    editSharing: 'Edit sharing',
    error: 'Couldn’t update. Try again.',
    errorAction: 'Retry',
    a11y: {
      follow: (name: string): string => `Follow ${name}`,
      followBack: (name: string): string => `Follow ${name} back`,
      requested: (name: string): string =>
        `Requested. Double-tap to cancel your request to ${name}`,
      following: (name: string): string => `Following ${name}. Double-tap to unfollow`,
      self: 'Edit what followers see',
    },
  },

  confirm: {
    unfollow: {
      title: (first: string): string => `Unfollow ${first}?`,
      bodyPrivate: 'You’ll need to ask again to see their meals and workouts.',
      cta: 'Unfollow',
    },
    cancelRequest: {
      title: 'Cancel your request?',
      cta: 'Cancel request',
      keep: 'Keep request',
    },
  },

  // ─── §6 Search ───────────────────────────────────────────────────────────────
  search: {
    keepTyping: 'Keep typing…',
    noResults: {
      title: (query: string): string => `No one found for “${query}”`,
      body: 'They may not have turned on Following yet.',
    },
    rateLimited: 'Too many searches. Try again in a minute.',
    error: 'Couldn’t search right now.',
    offline: 'Search needs a connection',
    announce: (n: number): string =>
      n === 0 ? 'No one found' : `${num(n)} ${plural(n, 'person', 'people')} found`,
  },

  // ─── §7 Requests and Activity ────────────────────────────────────────────────
  requests: {
    title: 'Follow requests',
    subtitle: 'Only you can see this list.',
    empty: {
      title: 'No requests',
      body: 'When someone asks to follow you, it shows up here.',
    },
  },

  activity: {
    title: 'Activity',
    new: 'New',
    earlier: 'Earlier',
    request: (name: string): string => `${name} wants to follow you`,
    newFollower: (name: string): string => `${name} started following you`,
    accepted: (name: string): string => `${name} accepted your request`,
    youAccepted: 'You accepted',
    youDeclined: 'You declined',
    empty: {
      title: 'Nothing yet',
      body: 'Follow requests and new followers show up here.',
    },
    retention: 'Activity is kept for 90 days.',
  },

  // ─── §8 Profile view ─────────────────────────────────────────────────────────
  profile: {
    counts: (followers: number, following: number): string =>
      `${num(followers)} ${plural(followers, 'follower', 'followers')} · ${num(following)} following`,
    followsYou: 'Follows you',
    moreOptions: (name: string): string => `More options for ${name}`,
    food: 'Food',
    gym: 'Gym',
    badgePrivate: 'Private',
    badgePublic: 'Public',
    error: 'Couldn’t load this profile.',
  },

  locked: {
    private: {
      title: 'This profile is private',
      body: (first: string): string => `Follow ${first} to see their meals and workouts.`,
    },
    requested: {
      title: 'Request sent',
      body: (first: string): string => `You’ll see their meals and workouts once ${first} accepts.`,
    },
    public: {
      body: (first: string): string => `Follow ${first} to see their meals and workouts.`,
    },
  },

  notShared: {
    plan: (first: string): string => `${first} isn’t sharing their meal plan`,
    recipes: (first: string): string => `${first} isn’t sharing their recipes`,
    workouts: (first: string): string => `${first} isn’t sharing their workouts`,
  },

  preview: {
    banner: 'This is what your followers see.',
    hidden: 'Hidden from followers',
    forcedPrivate: 'Your profile is private because several people reported it.',
  },

  notAvailable: {
    title: 'Profile not available',
    body: 'This profile doesn’t exist or isn’t available to you.',
    cta: 'Go back',
  },

  // ─── §9 Food tab ─────────────────────────────────────────────────────────────
  food: {
    thisWeek: 'This week',
    recipes: (n: number): string => (n > 0 ? `Recipes ${num(n)}` : 'Recipes'),
    /** `dMMM` is the owner's Monday already formatted, e.g. "28 Sep". */
    weekOf: (dMMM: string): string => `Week of ${dMMM}`,
    avg: (kcal: number): string => `avg ${num(kcal)} kcal/day`,
    portion: (n: number): string => `${num(n)} ${plural(n, 'portion', 'portions')}`,
    macros: (kcal: number, p: number, c: number, f: number): string =>
      `${num(kcal)} kcal · P ${num(p)} g · C ${num(c)} g · F ${num(f)} g`,
    dayTotal: (kcal: number): string => `Day total ${num(kcal)} kcal`,
    target: (kcal: number, p: number): string => `Target ${num(kcal)} kcal · P ${num(p)} g`,
    hiddenRecipe: 'Hidden recipe',
    hiddenRecipeLabel: (kcal: number): string => `Hidden recipe, ${num(kcal)} kcal`,
    leftoversFrom: (day: string): string => `Leftovers from ${day}`,
    emptyDay: (weekday: string): string => `Nothing planned for ${weekday}.`,
    noPlan: (first: string): string => `${first} hasn’t planned this week yet.`,
  },

  recipes: {
    search: (first: string): string => `Search ${first}’s recipes`,
    empty: (first: string): string => `${first} hasn’t shared any recipes yet.`,
    /** a11y label of the heart. */
    save: (recipe: string): string => `Save ${recipe}`,
    unsave: (recipe: string): string => `Remove ${recipe} from saved`,
    saved: 'Saved to your cookbook',
    removed: 'Removed from saved',
    perServing: (kcal: number, mins: number): string => `${num(kcal)} kcal · ${mins} min`,
  },

  recipe: {
    by: (name: string): string => `By ${name}`,
    byLabel: (name: string): string => `By ${name}. Open profile`,
    from: (first: string): string => `From ${first}`,
    fromGone: 'From another Chefer cook',
    source: (domain: string): string => `Source: ${domain}`,
    sourceLabel: (domain: string): string => `Open the original recipe on ${domain}`,
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
    replace: 'Replace',
    /** `day` and `meal` are pre-formatted, e.g. "Tue" / "lunch". */
    cta: (day: string, meal: string): string => `Add to ${day} ${meal}`,
    noPlan: 'You don’t have a plan for this week yet.',
    makePlan: 'Make a plan',
    replaceTitle: (meal: string): string => `Replace ${meal}?`,
    replaceBody: (recipe: string, day: string, meal: string): string =>
      `${recipe} goes on ${day} ${meal} instead.`,
    done: (day: string, meal: string): string => `Added to ${day} ${meal}`,
    useAnyway: 'Use anyway',
  },

  // ─── §10 Gym tab ─────────────────────────────────────────────────────────────
  gym: {
    routine: 'Routine',
    lastSevenDays: 'Last 7 days',
    showAll: 'Show all',
    showSets: 'Show sets',
    hideSets: 'Hide sets',
    custom: '(custom)',
    exercises: (n: number): string => `${num(n)} ${plural(n, 'exercise', 'exercises')}`,
    noRoutine: (first: string): string => `${first} doesn’t have a routine yet.`,
    noWorkouts: 'No workouts in the last 7 days.',
    routineDay: (dayName: string, weekday: string): string => `${dayName} · ${weekday}`,
    setsLabel: (sets: number, repMin: number, repMax: number): string =>
      `${sets} ${plural(sets, 'set', 'sets')} of ${repMin}–${repMax} reps`,
  },

  // ─── §11 Sharing & privacy, safety and moderation ────────────────────────────
  settings: {
    title: 'Sharing & privacy',
    who: 'Who can follow you',
    what: 'What followers can see',
    safety: 'Safety',
    plan: 'This week’s meal plan',
    recipes: 'Recipes you’ve written or imported',
    workouts: 'Your routine and workouts',
    targets: 'Your daily targets',
    targetsDetail: 'Calorie and macro targets, next to your meal plan.',
    preview: 'See what followers see',
    blocked: (n: number): string => `Blocked people (${num(n)})`,
    turnOff: 'Turn off Following',
    forcedPrivate:
      'Your profile is private because several people reported it. It can’t be made public.',
    saveError: 'Couldn’t save. Try again.',
  },

  targets: {
    confirm: {
      title: 'Share your daily targets?',
      body: 'Followers will see your daily calorie and macro targets next to your meal plan.',
      cta: 'Share targets',
    },
  },

  public: {
    confirm: {
      title: 'Make your profile public?',
      /** `sections` is a pre-joined list, e.g. "meals, recipes and workouts". */
      body: (sections: string): string =>
        `Anyone on Chefer will be able to follow you without asking, and then see what you share: ${sections}.`,
      pending: (n: number): string =>
        `Your ${num(n)} pending ${plural(n, 'request', 'requests')} will be accepted.`,
      cta: 'Make public',
    },
  },

  private: {
    confirm: {
      title: 'Make your profile private?',
      body: (followers: number): string =>
        `New followers will need your approval. ${
          followers === 1
            ? 'Your 1 current follower can still see what you share. You can remove them.'
            : `Your ${num(followers)} current followers can still see what you share. You can remove any of them.`
        }`,
      cta: 'Make private',
      reviewFollowers: 'Review followers',
    },
  },

  privacyRow: {
    label: 'Profile visibility',
    private: 'Private',
    public: 'Public',
    off: 'Off',
  },

  remove: {
    title: (first: string): string => `Remove ${first} as a follower?`,
    body: 'They won’t be told. They can follow you again, or ask to if your profile is private.',
    cta: 'Remove',
    done: (first: string): string => `${first} removed`,
  },

  block: {
    title: (first: string): string => `Block ${first}?`,
    body: 'They won’t be able to find you or see your profile, and you won’t see theirs or their recipes. Any follows between you are removed. They won’t be told.',
    cta: 'Block',
    done: (first: string): string => `${first} blocked`,
  },

  unblock: {
    title: (first: string): string => `Unblock ${first}?`,
    body: 'They’ll be able to find you again. Follows aren’t restored.',
    cta: 'Unblock',
  },

  report: {
    titleUser: (first: string): string => `Report ${first}`,
    titleRecipe: 'Report this recipe',
    body: (first: string): string =>
      `Tap a reason. We’ll block ${first} straight away, so you won’t see them or their recipes again.`,
    /** Keyed by the `REPORT_REASONS` enum values. */
    reasons: {
      INAPPROPRIATE: 'Offensive name or recipe',
      SPAM: 'Spam or fake account',
      HARASSMENT: 'Harassment',
      UNSAFE: 'Unsafe or harmful content',
      OTHER: 'Something else',
    },
    reasonHint: (name: string): string => `Reports and blocks ${name}`,
    profileAction: (first: string): string => `Report and block ${first}`,
    done: (first: string): string =>
      `Reported and blocked. You won’t see ${first} or their recipes again.`,
    error: 'Couldn’t send. Try again.',
  },

  blocked: {
    empty: 'You haven’t blocked anyone.',
  },

  turnOff: {
    title: 'Turn off Following?',
    intro: 'This removes you from Following straight away:',
    bullets: [
      'People can’t find or follow you',
      'You stop following everyone, and everyone stops following you',
      'Your recipes disappear from other people’s saved lists (copies they already added to their weeks stay theirs)',
      'Your requests and Activity are deleted',
    ],
    outro: 'You can turn Following on again later, starting fresh.',
    cta: 'Turn off Following',
    done: 'Following is off.',
  },

  // ─── Cross-cutting ───────────────────────────────────────────────────────────
  offline: {
    line: (time: string): string => `Offline · showing what was saved ${time}`,
    needsConnection: 'Needs a connection',
  },

  unavailable: 'Following isn’t available right now.',

  /** Screen-reader announcements (UX §13). */
  announce: {
    requestAccepted: (name: string): string => `Request from ${name} accepted`,
    nowFollowing: (name: string): string => `Now following ${name}`,
    requestSent: (name: string): string => `Request sent to ${name}`,
    reportedAndBlocked: 'Reported and blocked',
    personRowHint: 'Opens profile',
  },
} as const;

export type FriendsCopy = typeof FRIENDS_COPY;
