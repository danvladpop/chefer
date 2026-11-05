// Lane J phase 4, `today.progress.*`: the Progress screen (web /progress and
// the app's legacy Progress), the weight card, weigh-in form and list, the
// trend line, and the chef's weekly review banner. Keys whose text shows a
// calorie figure end in `.kcal`; protein figures say `protein` (the
// numbers-mode source scans look for both).
export const todayProgress = {
  page: {
    eyebrow: 'Insights',
    title: 'Progress',
    daysLogged: 'Days logged',
    avg: { kcal: 'Avg kcal' },
    vsTarget: 'vs target',
    timeRange: 'Time range',
    moreDays: {
      one: 'Log {count} more day to see your average',
      other: 'Log {count} more days to see your average',
    },
    loadError: "Couldn't load your progress",
    calories: {
      title: 'Calories — Last {span}',
      titleWeekly: 'Calories — Weekly Averages, Last {span}',
      /** The app's legacy screen. */
      titleDays: { one: 'Calories — last {count} day', other: 'Calories — last {count} days' },
      tooltip: { kcal: '{value} kcal' },
      target: 'Target',
      logged: 'Logged',
      chartA11y: {
        kcal: {
          one: 'Calories logged on {logged} of the last {count} day, average {avg} against a target of {target}',
          other:
            'Calories logged on {logged} of the last {count} days, average {avg} against a target of {target}',
        },
      },
    },
    macros: {
      title: 'Macros — Last {span} (g)',
      titleWeekly: 'Macros — Weekly Averages, Last {span} (g)',
      titleDays: { one: 'Macros — last {count} day (g)', other: 'Macros — last {count} days (g)' },
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
      empty: 'No log data yet.',
      emptyApp: 'Log a meal to see your protein, carbs and fat here.',
      chartA11y: {
        one: 'Daily protein, carbs and fat in grams, last {count} day',
        other: 'Daily protein, carbs and fat in grams, last {count} days',
      },
    },
    noData: 'No log data yet — start tracking in the {tracker}.',
    noDataApp: 'No log data yet — start tracking in the Tracker.',
    trackerLink: 'Tracker',
    openTracker: 'Open Tracker',
    week: {
      onTarget: 'About on your target this week',
      under: 'About {pct} % under your target this week',
      over: 'About {pct} % over your target this week',
    },
  },

  /** STATS_RANGE_LABELS and STATS_RANGE_SPAN (1W / 1M / 3M / 1Y). */
  range: {
    label: { d7: '1W', d30: '1M', d90: '3M', d365: '1Y' },
    span: { d7: '7 days', d30: '30 days', d90: '90 days', d365: 'a year' },
  },

  /** The app's progress photos grid (the shared copy is `today.photos`). */
  photos: {
    photoFrom: 'Progress photo from {date}',
    photoHint: 'Selects it to compare. Long press to open it.',
    keep: 'Keep it',
  },

  /** The body-measurement chips' group label. */
  measure: 'Measure',

  weight: {
    title: 'Weight tracking',
    heading: 'Weight Tracking',
    lastWeighIn: 'Last weigh-in:',
    trend: 'Trend:',
    current: 'Current:',
    trendChange90: 'Trend change (90d):',
    towardGoal: '{change}, in line with your goal',
    trendSteady: 'Trend steady over {span}',
    trendChange: 'Trend {change} over {span}',
    /** formatWeightTrend(): the coach's weekly trend chip. */
    perWeek: '{change}/wk',
    steady: 'steady',
    explainer:
      'The line is your trend weight. It smooths out day-to-day swings from water, salt and timing.',
    legendWeighIn: 'Weigh-in',
    legendTrend: 'Trend',
    fewInRange: 'Weigh in twice within {span} to see your trend here.',
    empty: 'No weight entries yet. Log your first entry below.',
    loadError: "Couldn't load your weigh-ins",
    chartA11y: 'Weight over the last 90 days, currently {weight}',
  },

  card: {
    title: 'Weight',
    delta30: '({change} / 30d)',
    hint: 'Log your weight a couple of times a week and your chef can read the trend.',
    loggedToday: 'Logged today: {weight}',
    todayPlaceholder: 'Today: {weight}?',
    editEntries: 'Edit or delete entries',
    hideEntries: 'Hide entries',
    seeProgress: 'See progress',
    reviewHint: {
      one: 'Log meals on {count} more day this week and your chef will write you a Sunday review.',
      other:
        'Log meals on {count} more days this week and your chef will write you a Sunday review.',
    },
    sparklineA11y: {
      one: 'Weight over the last {count} day: {summary}',
      other: 'Weight over the last {count} days: {summary}',
    },
    sparklineSummary: '{start} → {end} {unit}',
  },

  form: {
    placeholderKg: '{value} kg',
    placeholderLb: '{value} lb',
    placeholderApp: 'Log today’s weight ({unit})',
    labelKg: "Today's weight in kilograms",
    labelLb: "Today's weight in pounds",
    log: 'Log',
    saved: '✓ Saved',
    logA11y: 'Log weight',
    logged: 'Logged {weight}',
    undo: 'Undo',
    alreadyLogged: 'Already logged {weight} today',
    errors: {
      empty: 'Enter your weight.',
      format: 'Use a number like {example}.',
      range: 'Weight must be between {min} and {max} {unit}.',
    },
  },

  entries: {
    title: 'Entries',
    inputKg: 'Weight on {date} in kilograms',
    inputLb: 'Weight on {date} in pounds',
    save: 'Save weight',
    cancel: 'Cancel editing',
    edit: 'Edit {weight} on {date}',
    delete: 'Delete {weight} on {date}',
    confirm: 'Delete {weight} on {date}?',
    confirmTitle: 'Delete weigh-in?',
    confirmBody: '{weight} on {date}',
    keep: 'Keep',
    showFewer: 'Show fewer',
    showAll: 'Show all {count}',
  },

  review: {
    noticed: 'Your chef noticed something about your week…',
    teaser:
      'Your chef wrote a few more lines about your week — the trend, the pattern behind it, and what next week should change.',
    teaserApp:
      'The rest of the review covers your protein pattern, the two dinners worth repeating, and one change for next week.',
    locked: 'Full review + auto-adjusting targets are premium',
    lockedApp: 'The full review and auto-adjusting targets are part of Premium.',
    seePremium: 'See what Premium adds',
    title: "Your chef's weekly review",
    aiA11y: 'This review was written by AI',
    logged: '{value} logged',
    avgPerDay: { kcal: '{value} kcal/day avg' },
    budget: { kcal: 'budget {value} kcal' },
    seeFull: 'See full review →',
    showLess: 'Show less',
    weekOf: 'Week of {date}',
    statDaysLogged: 'Days logged',
    statAvgProtein: 'Avg protein',
    statProteinValue: '{value} g',
    statAvgIntake: 'Avg intake',
    statIntake: { kcal: '{value} kcal' },
    statWeightTrend: 'Weight trend',
    budgetChanged: {
      kcal: 'Your daily calorie budget changed by {value} kcal — the dashboard, tracker and your next generated week all use the new number.',
    },
    why: 'Why?',
    whyA11y: 'Why these numbers',
    explainEyebrow: 'Your weekly review',
    explainTitle: 'Where these numbers come from',
    explainSentence: {
      kcal: 'Your chef looked at the last 7 days: you logged {days} of them, averaging {avg} kcal on those days.',
    },
    explainSentenceBudget: {
      kcal: 'Your chef looked at the last 7 days: you logged {days} of them, averaging {avg} kcal on those days. Your daily budget moved by {change} kcal, one small step per review and only when at least half your days were logged.',
    },
    explainSentenceProtein: 'Your chef looked at the last 7 days: you logged {days} of them.',
    rowDaysLogged: 'Days logged',
    rowDaysLoggedValue: '{days} of 7 ({pct} %)',
    rowAverage: 'Average on logged days',
    rowAverageValue: { kcal: '{value} kcal' },
    rowWeightTrend: 'Weight trend',
    rowBudgetChange: 'Daily budget change',
    rowBudgetChangeValue: { kcal: '{value} kcal' },
    rowAverageProtein: 'Average protein',
    rowAverageProteinValue: '{value} g a day',
    footnote: 'Averages only count the days you logged.',
  },
} as const;
