// Lane J phase 2. Following copy (docs/friends/ux-design.md §12), moved from
// `FRIENDS_COPY` in @chefer/types. The user-facing word is "Following"; the
// word "Friends" must never appear in a string (friends-copy.test.ts and the
// mobile copy scan guard it). Strings the API sends itself (`server.*`,
// `intro.nameRejected`, …) stay in FRIENDS_COPY; the client does not use them.
export const friends = {
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
    filterHidden: {
      one: 'One of your recipes won’t be shown to followers because of words in their name or description.',
      other:
        '{count} of your recipes won’t be shown to followers because of words in their name or description.',
    },
  },

  // ─── §5 Following home ───────────────────────────────────────────────────────
  home: {
    title: 'Following',
    searchPlaceholder: 'Search by name',
    searchLabel: 'Search people by name',
    requests: 'Requests · {n}',
    seeAllRequests: 'See all {n}',
    youFollow: 'You follow {n}',
    followers: 'Followers {n}',
    suggested: 'Suggested for you',
    seeAll: 'See all',
    activityLabel: 'Activity',
    activityLabelNew: 'Activity, {unread} new',
    settingsLabel: 'Sharing and privacy',
    hideSuggestion: 'Hide suggestion {name}',
    sectionError: {
      requests: 'Couldn’t load your requests.',
      list: 'Couldn’t load this list.',
      suggestions: 'Couldn’t load suggestions.',
    },
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
    message:
      'I’m using Chefer to plan meals and workouts. Follow me in Chefer: {myName}. {appLink}',
  },

  reason: {
    mutualOne: 'Followed by {name}',
    mutualMany: {
      one: 'Followed by {name} and {count} other',
      other: 'Followed by {name} and {count} others',
    },
    followsYou: 'Follows you',
    popular: 'Popular on Chefer',
  },

  requestRow: {
    accept: 'Accept',
    decline: 'Decline',
    acceptLabel: 'Accept {name}',
    declineLabel: 'Decline {name}',
  },

  accepted: {
    snackbar: '{first} can now see your meals and workouts.',
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
      follow: 'Follow {name}',
      followBack: 'Follow {name} back',
      requested: 'Requested. Double-tap to cancel your request to {name}',
      following: 'Following {name}. Double-tap to unfollow',
      self: 'Edit what followers see',
    },
  },

  confirm: {
    unfollow: {
      title: 'Unfollow {first}?',
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
      title: 'No one found for “{query}”',
      body: 'They may not have turned on Following yet.',
    },
    rateLimited: 'Too many searches. Try again in a minute.',
    error: 'Couldn’t search right now.',
    offline: 'Search needs a connection',
    announceNone: 'No one found',
    announce: { one: '{count} person found', other: '{count} people found' },
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
    request: '{name} wants to follow you',
    newFollower: '{name} started following you',
    accepted: '{name} accepted your request',
    youAccepted: 'You accepted',
    youDeclined: 'You declined',
    empty: {
      title: 'Nothing yet',
      body: 'Follow requests and new followers show up here.',
    },
    retention: 'Activity is kept for 90 days.',
    age: {
      minutes: '{n}m',
      hours: '{n}h',
      yesterday: 'Yesterday',
      days: { one: '{count} day', other: '{count} days' },
      date: '{day} {month}',
    },
  },

  // ─── §8 Profile view ─────────────────────────────────────────────────────────
  profile: {
    counts: {
      one: '{count} follower · {following} following',
      other: '{count} followers · {following} following',
    },
    followsYou: 'Follows you',
    moreOptions: 'More options for {name}',
    food: 'Food',
    gym: 'Gym',
    foodOrGym: 'Food or Gym',
    loadingLabel: 'Loading',
    badgePrivate: 'Private',
    badgePublic: 'Public',
    error: 'Couldn’t load this profile.',
  },

  locked: {
    private: {
      title: 'This profile is private',
      body: 'Follow {first} to see their meals and workouts.',
    },
    requested: {
      title: 'Request sent',
      body: 'You’ll see their meals and workouts once {first} accepts.',
    },
    public: {
      body: 'Follow {first} to see their meals and workouts.',
    },
  },

  notShared: {
    plan: '{first} isn’t sharing their meal plan',
    recipes: '{first} isn’t sharing their recipes',
    workouts: '{first} isn’t sharing their workouts',
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
    recipes: 'Recipes',
    recipesCount: 'Recipes {n}',
    weekOf: 'Week of {dMMM}',
    avg: 'avg {kcal} kcal/day',
    portion: { one: '{count} portion', other: '{count} portions' },
    macros: '{kcal} kcal · P {p} g · C {c} g · F {f} g',
    macroLine: 'P {p} g · C {c} g · F {f} g',
    todayDay: '{weekday}, today',
    dayTotal: 'Day total {kcal} kcal',
    target: 'Target {kcal} kcal · P {p} g',
    hiddenRecipe: 'Hidden recipe',
    hiddenRecipeLabel: 'Hidden recipe, {kcal} kcal',
    leftoversFrom: 'Leftovers from {day}',
    emptyDay: 'Nothing planned for {weekday}.',
    noPlan: '{first} hasn’t planned this week yet.',
  },

  recipes: {
    search: 'Search {first}’s recipes',
    empty: '{first} hasn’t shared any recipes yet.',
    save: 'Save {recipe}',
    unsave: 'Remove {recipe} from saved',
    saved: 'Saved to your cookbook',
    removed: 'Removed from saved',
    perServing: '{kcal} kcal · {mins} min',
  },

  recipe: {
    by: 'By {name}',
    byLabel: 'By {name}. Open profile',
    from: 'From {first}',
    fromGone: 'From another Chefer cook',
    source: 'Source: {domain}',
    sourceLabel: 'Open the original recipe on {domain}',
    addToWeek: 'Add to my week',
    report: 'Report recipe',
    hidden: {
      title: 'Hidden from people who follow you',
      reports: 'Several people reported this recipe, so it’s no longer shown to others.',
      filter:
        'Some words in its name or description aren’t allowed on shared recipes. Edit it to share it again.',
    },
  },

  addToWeek: {
    title: 'Add to your week',
    eyebrow: '{recipe} · {kcal} kcal',
    thisWeek: 'This week',
    nextWeek: 'Next week',
    addHere: 'Add here',
    addAsSide: 'Add as a side',
    replace: 'Replace',
    replaceThisMeal: 'Replace this meal',
    cta: 'Add to {day} {meal}',
    noPlan: 'You don’t have a plan for this week yet.',
    makePlan: 'Make a plan',
    replaceTitle: 'Replace {meal}?',
    replaceBody: '{recipe} goes on {day} {meal} instead.',
    done: 'Added to {day} {meal}',
    useAnyway: 'Use anyway',
  },

  meal: {
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
    snack: 'snack',
  },

  format: {
    dayMonth: '{day} {month}',
    weekdayDayMonth: '{weekday} {dayMonth}',
  },

  // ─── §10 Gym tab ─────────────────────────────────────────────────────────────
  gym: {
    routine: 'Routine',
    lastSevenDays: 'Last 7 days',
    showAll: 'Show all',
    showSets: 'Show sets',
    hideSets: 'Hide sets',
    customName: '{name} (custom)',
    exercises: { one: '{count} exercise', other: '{count} exercises' },
    noRoutine: '{first} doesn’t have a routine yet.',
    noWorkouts: 'No workouts in the last 7 days.',
    routineDay: '{dayName} · {weekday}',
    setsLabel: {
      one: '{count} set of {repMin}–{repMax} reps',
      other: '{count} sets of {repMin}–{repMax} reps',
    },
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
    blocked: 'Blocked people ({n})',
    turnOff: 'Turn off Following',
    forcedPrivate:
      'Your profile is private because several people reported it. It can’t be made public.',
    saveError: 'Couldn’t save. Try again.',
    notActivated: 'Turn on Following to use this.',
  },

  targets: {
    confirm: {
      title: 'Share your daily targets?',
      body: 'Followers will see your daily calorie and macro targets next to your meal plan.',
      cta: 'Share targets',
    },
  },

  public: {
    sections: {
      meals: 'meals',
      recipes: 'recipes',
      workouts: 'workouts',
      targets: 'daily targets',
      profileOnly: 'your name and photo',
    },
    sectionsAnd: '{head} and {last}',
    confirm: {
      title: 'Make your profile public?',
      body: 'Anyone on Chefer will be able to follow you without asking, and then see what you share: {sections}.',
      pending: {
        one: 'Your {count} pending request will be accepted.',
        other: 'Your {count} pending requests will be accepted.',
      },
      cta: 'Make public',
    },
  },

  private: {
    confirm: {
      title: 'Make your profile private?',
      body: {
        one: 'New followers will need your approval. Your 1 current follower can still see what you share. You can remove them.',
        other:
          'New followers will need your approval. Your {count} current followers can still see what you share. You can remove any of them.',
      },
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
    menu: 'Remove follower',
    title: 'Remove {first} as a follower?',
    body: 'They won’t be told. They can follow you again, or ask to if your profile is private.',
    cta: 'Remove',
    done: '{first} removed',
  },

  block: {
    title: 'Block {first}?',
    body: 'They won’t be able to find you or see your profile, and you won’t see theirs or their recipes. Any follows between you are removed. They won’t be told.',
    cta: 'Block',
    profileAction: 'Block {first}',
    done: '{first} blocked',
  },

  unblock: {
    title: 'Unblock {first}?',
    body: 'They’ll be able to find you again. Follows aren’t restored.',
    cta: 'Unblock',
  },

  report: {
    titleUser: 'Report {first}',
    titleRecipe: 'Report this recipe',
    body: 'Tap a reason. We’ll block {first} straight away, so you won’t see them or their recipes again.',
    reasons: {
      INAPPROPRIATE: 'Offensive name or recipe',
      SPAM: 'Spam or fake account',
      HARASSMENT: 'Harassment',
      UNSAFE: 'Unsafe or harmful content',
      OTHER: 'Something else',
    },
    reasonHint: 'Reports and blocks {name}',
    profileAction: 'Report and block {first}',
    done: 'Reported and blocked. You won’t see {first} or their recipes again.',
    error: 'Couldn’t send. Try again.',
  },

  blocked: {
    title: 'Blocked people',
    empty: 'You haven’t blocked anyone.',
    unblockLabel: 'Unblock {name}',
  },

  consent: {
    labelOn: 'Following and sharing: on',
    labelOff: 'Following and sharing: off',
  },

  turnOff: {
    title: 'Turn off Following?',
    intro: 'This removes you from Following straight away:',
    bulletFind: 'People can’t find or follow you',
    bulletFollows: 'You stop following everyone, and everyone stops following you',
    bulletRecipes:
      'Your recipes disappear from other people’s saved lists (copies they already added to their weeks stay theirs)',
    bulletActivity: 'Your requests and Activity are deleted',
    outro: 'You can turn Following on again later, starting fresh.',
    cta: 'Turn off Following',
    done: 'Following is off.',
  },

  // ─── Cross-cutting ───────────────────────────────────────────────────────────
  offline: {
    line: 'Offline · showing what was saved {time}',
    needsConnection: 'Needs a connection',
  },

  unavailable: 'Following isn’t available right now.',

  announce: {
    requestAccepted: 'Request from {name} accepted',
    nowFollowing: 'Now following {name}',
    requestSent: 'Request sent to {name}',
    reportedAndBlocked: 'Reported and blocked',
    personRowHint: 'Opens profile',
  },

  appeal: {
    prompt: 'Think this is a mistake?',
    action: 'Email {email}',
    a11y: 'Think this is a mistake? Email {email} to appeal',
    subjectRecipe: 'Appeal: hidden recipe',
    subjectProfile: 'Appeal: private profile',
  },
} as const;
