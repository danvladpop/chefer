// Lane J phase 4, `today.shell.*`: the mobile shell's Today, its nutrition
// and training cards, Stats and You (apps/mobile/src/features/shell).
export const todayShell = {
  // ─── Today (today-screen.tsx) ──────────────────────────────────────────────
  today: {
    loading: 'Loading today',
    loadError: 'Couldn’t load your day',
    weekReady: {
      title: 'Your week is ready',
      rated: {
        one: 'Built from {count} dish you rated.',
        other: 'Built from {count} dishes you rated.',
      },
      sunday: 'The chef prepared it on Sunday.',
    },
    profileNudge: {
      label: 'Complete your profile',
      hint: 'Your goals, body metrics and dietary needs shape your plans',
    },
    nextMeal: 'Next meal',
    caughtUp: 'You’re all caught up for today.',
    noMeals: 'No meals planned yet.',
    openMeals: 'Open Meals',
  },

  // ─── Top bar (shell-chrome.tsx, add-action.tsx, app/(main)/home.tsx) ───────
  chrome: {
    /** The Ask Chef pill. */
    askChef: 'Ask Chef',
    askChefLabel: 'Ask the chef',
    addLabel: 'Add food',
  },
  /** Today's Add sheet. */
  add: {
    title: 'Add to today',
    food: 'Food',
    training: 'Training',
    search: 'Search foods',
    snap: 'Snap a meal',
    copy: 'Copy yesterday',
    recipe: 'Save a recipe',
    logWorkout: 'Log a workout',
  },
  /** The Log a workout sheet (log-workout-sheet.tsx). */
  logWorkout: {
    title: 'Log a workout',
    eyebrowToday: 'Today',
    eyebrowElsewhere: 'Done elsewhere or earlier',
    gymWorkout: 'Gym workout you did',
    freestyle: 'Freestyle',
    doneElsewhere: 'Done elsewhere',
    resume: 'Resume your workout',
    startFreestyle: 'Start a freestyle workout now',
  },
  /** The workout bar above the tab bar (workout-mini-bar.tsx). */
  miniBar: {
    resume: 'Resume',
    detail: {
      one: '{minutes} min · {done} of {count} exercise',
      other: '{minutes} min · {done} of {count} exercises',
    },
    coachedDetail: '{minutes} min · {day}',
    spoken: {
      one: '{name}, in progress, {count} minute',
      other: '{name}, in progress, {count} minutes',
    },
    hint: 'Opens your workout',
    coachedHint: 'Opens the coached workout',
  },
  /** Train's links to the old Gym tabs (train-links.tsx). */
  trainLinks: {
    title: 'Your training',
    routine: 'Routine',
    exercises: 'Exercises',
    stats: 'Stats and history',
    gymSettings: 'Gym settings',
  },
  /** The new-design preview switch (shell-preview-row.tsx). */
  preview: {
    section: 'Preview',
    footer: 'Try the new app design on this phone. Only admins and test builds see this.',
    row: 'New design',
    switchLabel: 'Preview the new design',
  },

  // ─── Calorie gauge (@chefer/ui-mobile CalorieGauge) ─────────────────────────
  gauge: {
    kcalEaten: 'kcal eaten',
    kcalLeft: 'left',
    kcalOver: 'over',
    kcalTarget: 'target',
    spoken: {
      kcalLeft: '{value} of {target} kcal eaten, {remaining} left',
      kcalOver: '{value} of {target} kcal eaten, {over} over',
      kcalNoTarget: '{value} kcal eaten',
    },
  },

  // ─── Macro rows and tiles (@chefer/ui-mobile MacroRow / MacroTiles) ────────
  macros: {
    names: { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' },
    /** The neutral chip once over target: "4 g over". */
    overGrams: '{value} g over',
    /** Spoken; the plural follows the target (or, without one, the value) in grams. */
    spoken: {
      withTarget: {
        one: '{name}, {value} of {target} gram',
        other: '{name}, {value} of {target} grams',
      },
      over: {
        one: '{name}, {value} of {target} gram, {over} over',
        other: '{name}, {value} of {target} grams, {over} over',
      },
      noTarget: { one: '{name}, {value} gram', other: '{name}, {value} grams' },
    },
  },

  // ─── Nutrition card (nutrition-card.tsx) ───────────────────────────────────
  nutrition: {
    /** Protein-only mode's big number: "72 g". */
    proteinGrams: '{value} g',
    /** Under it: "of 120 g protein". */
    proteinOfTarget: 'of {target} g protein',
  },

  // ─── Training (training-card.tsx) ──────────────────────────────────────────
  training: {
    title: 'Training',
    paused: 'Workout paused',
    inProgress: 'Workout in progress',
    exercisesDone: {
      one: '{done} of {count} exercise',
      other: '{done} of {count} exercises',
    },
    resume: 'Resume',
    doneAt: 'Done at {time}',
    summary: 'Summary',
    summaryOf: 'Summary of {name}',
    duration: 'Duration',
    minutesUnit: 'min',
    sets: 'Sets',
    exercises: 'Exercises',
    logAnother: 'Log another workout',
    plannedToday: 'Planned today',
    upNext: 'Up next · usually {weekday}',
    /** weekdayLabel(null). */
    noFixedDay: 'No fixed day',
    start: 'Start',
    startWorkout: 'Start workout',
    logWorkout: 'Log a workout',
    doneNext: 'Done today · Next: {day} on {weekday}',
    restNext: 'Rest day · Next: {day} on {weekday}',
    openTrain: 'Open Train',
    train: 'Train',
    trainAnyway: 'Train anyway',
    workoutMeta: {
      one: '{count} exercise · ~{min} min',
      other: '{count} exercises · ~{min} min',
    },
    /** The calories-burned tile (sessionKcalCopy in @chefer/utils). */
    burn: {
      estimate: {
        value: '~{value}',
        label: { kcal: 'kcal burned (est.)' },
        spoken: { kcal: 'About {value} kilocalories burned, estimated' },
        hint: 'Estimated from your body weight and workout time',
      },
      logged: {
        label: { kcal: 'kcal you logged' },
        spoken: { kcal: '{value} kilocalories burned, as you logged' },
        hint: 'The calories you entered for this workout',
      },
    },
  },

  // ─── Stats (stats-screen.tsx) ──────────────────────────────────────────────
  stats: {
    tabs: { eating: 'Eating', strength: 'Strength' },
    tabsLabel: 'Stats for',
    rangeLabel: 'Time range',
    /** The range control: STATS_RANGE_LABELS. */
    range: { w1: '1W', m1: '1M', m3: '3M', y1: '1Y' },
    /** The range in prose: STATS_RANGE_SPAN ("over 30 days", "within a year"). */
    span: { w1: '7 days', m1: '30 days', m3: '90 days', y1: 'a year' },
    review: {
      teaserHint: 'See what Premium adds',
      teaserFallback: 'Your chef noticed something about your week…',
      showLess: 'Shows less',
      showFull: 'Shows the full review',
    },
    eating: 'Eating',
    loadError: 'Couldn’t load your eating stats',
    daysLogged: 'days logged',
    avg: {
      protein: 'avg protein / day',
      kcal: 'avg kcal / day',
    },
    vsTarget: 'vs target',
    moreDays: {
      one: 'Log {count} more day to see your averages',
      other: 'Log {count} more days to see your averages',
    },
    nothingLogged: 'Nothing logged yet in these days.',
    openDay: 'Open your day',
    chart: {
      daily: {
        kcal: {
          one: 'Calories logged on {logged} of the last {count} day against a target of {target}',
          other:
            'Calories logged on {logged} of the last {count} days against a target of {target}',
        },
        protein: {
          one: 'Protein logged on {logged} of the last {count} day against a target of {target}',
          other: 'Protein logged on {logged} of the last {count} days against a target of {target}',
        },
      },
      weekly: {
        kcal: {
          one: 'Calories logged on {logged} of the last {count} day, as weekly averages, against a target of {target}',
          other:
            'Calories logged on {logged} of the last {count} days, as weekly averages, against a target of {target}',
        },
        protein: {
          one: 'Protein logged on {logged} of the last {count} day, as weekly averages, against a target of {target}',
          other:
            'Protein logged on {logged} of the last {count} days, as weekly averages, against a target of {target}',
        },
      },
    },
    /** The dashed target line's label in protein-only mode: "120 g". */
    targetLineProtein: '{value} g',
    weeklyBars: 'Each bar is a week: the daily average of the days you logged',
    dailyAverages: 'Daily averages on logged days',
    weight: 'Weight',
    noWeighIns: 'No weigh-ins yet.',
    trend: 'Trend {weight}',
    trendSteady: 'Trend steady over {span}',
    trendChange: 'Trend {change} over {span}',
    logWeight: 'Log weight',
    closeWeighIn: 'Close weigh-in',
    weightLoadError: 'Couldn’t load your weigh-ins',
    weightChart: 'Weight over the last {span}, last weigh-in {weight}',
    weightChartTrend: 'Weight over the last {span}, last weigh-in {weight}, trend {trend}',
    trendExplainer:
      'The line is your trend weight. It smooths out day-to-day swings from water, salt and timing.',
    weighInTwice: 'Weigh in twice within {span} to see your trend here.',
    hideEntries: 'Hide entries',
    editEntries: 'Edit entries',
  },

  // ─── You (you-screen.tsx) ──────────────────────────────────────────────────
  you: {
    progressSection: 'Your progress',
    settingsSection: 'Settings',
    peopleSection: 'People',
    meals: 'Meals',
    mealsDetail: 'Meals, days, allergies, budget',
    training: 'Training',
    trainingDetail: 'Units, equipment, reminders',
    notifications: 'Notifications',
    account: 'Account',
    accountDetail: 'Goal, targets, Premium, privacy',
    household: 'Household',
    /** householdSummary(): "You + Ana", "You + Ana, Ben". */
    householdNames: 'You + {names}',
    /** householdSummary() with three or more: "You + 3". */
    householdCount: 'You + {count}',
    previewFooter: 'Admins and test builds only.',
  },
} as const;
