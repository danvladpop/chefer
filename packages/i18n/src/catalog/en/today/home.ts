// Lane J phase 4, `today.home.*`: the web dashboard (Today) and the dashboard
// components both platforms share (nutrition summary, tonight card, training
// day note, today's slot notes). Keys whose text shows a calorie figure end in
// `.kcal`; protein and macro figures sit under a `protein` / `macros` key, so
// the "Hide numbers" source scans keep seeing them.
export const todayHome = {
  title: 'Today',

  mealTypes: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
  },
  /** The meal inside a sentence ("Undo for dinner"). */
  mealInSentence: {
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
    snack: 'snack',
  },

  // ─── Nutrition summary ─────────────────────────────────────────────────────
  status: {
    none: 'Nothing planned',
    under: 'Room for more',
    on: 'On track',
    headingOver: 'Heading over',
    over: { kcal: 'Over by {value} kcal' },
  },
  caption: {
    left: { kcal: '{left} left' },
    over: { kcal: '{over} over' },
    plannedLeft: { kcal: '{planned} planned · {left} left' },
    plannedOver: { kcal: '{planned} planned · {over} over' },
  },
  ring: {
    label: { kcal: '{eaten} of {target} kcal eaten today' },
    /** Inside the ring on mobile ("eaten" is in the accessible name). */
    caption: { kcal: 'of {target} kcal' },
    /** Inside the ring on web. */
    captionEaten: { kcal: 'of {target} kcal eaten' },
  },
  protein: {
    ringLabel: '{eaten} of {target} g protein eaten today',
    ringCaption: 'of {target} g protein',
    reached: 'Protein goal reached',
    toGo: '{value} g to go',
  },
  nothingLogged: 'Nothing logged yet',
  targetMode: {
    own: 'Your target',
    suggested: 'Suggested',
  },
  macros: {
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    value: '{value}g / {target}g',
    label: '{name}: {value} of {target} grams eaten',
    labelPlanned: '{name}: {value} of {target} grams eaten, {planned} planned',
  },
  upNext: 'Up next: {name}',
  logWhatYouAte: 'Log what you ate',
  links: {
    mealPlanner: 'Meal Planner',
    shoppingList: 'Shopping List',
  },

  // ─── Training day note ─────────────────────────────────────────────────────
  trainingDay: {
    label: 'Training day',
    protein: 'Training day · +{value} g protein',
    line: {
      lift: { kcal: 'Training day · +{kcal} kcal, +{protein} g protein' },
      run: { kcal: 'Run day · +{kcal} kcal, mostly carbs' },
      longRun: { kcal: 'Long run day · +{kcal} kcal, mostly carbs' },
    },
    carbsToday: 'Mostly carbs, added to today',
    carbsThisDay: 'Mostly carbs, added to this day',
    yourWorkout: 'Your workout',
    liftProtein: {
      doneToday: '{workout} done · protein at {perKg} g/kg, added to today',
      today: '{workout} today · protein at {perKg} g/kg, added to today',
      doneThisDay: '{workout} done · protein at {perKg} g/kg, added to this day',
      planned: '{workout} planned · protein at {perKg} g/kg, added to this day',
    },
    why: 'Why?',
    whyLabel: 'Why this training day target',
  },

  // ─── Today's replaced / skipped slots ──────────────────────────────────────
  slotNotes: {
    undo: 'Undo',
    undoFor: 'Undo for {meal}',
    youHadElse: 'You had something else',
  },

  // ─── Tonight card ──────────────────────────────────────────────────────────
  tonight: {
    badge: 'Tonight · Dinner',
    dinnerLine: 'Dinner · {status}',
    done: 'Dinner done · {name}',
    rateIt: 'Rate it',
    rateTitle: 'How was it?',
    rateHint: 'Your rating shapes what the chef cooks up next week.',
    open: 'Open {name}',
    cardLabel: 'Tonight: {name}, for {servings}.',
    meta: '{minutes} min · for {servings}',
    metaWith: { kcal: '{minutes} min · for {servings} · {value} kcal' },
    cookIt: 'Cook it',
    swap: 'Swap',
    ateThis: 'I ate this',
    logging: 'Logging…',
    logError: 'Couldn’t log it: {error}',
    nothingTitle: 'Nothing planned tonight',
    nothingBody: 'Pick something quick from your recipes',
    findRecipe: 'Find a recipe',
  },

  // ─── Next meal card (web next-meal-card, mobile hero-meal-card, tomorrow-card
  //     and the shell's next-meal-card) ───────────────────────────────────────
  nextMeal: {
    open: 'Open {name}',
    tomorrow: 'Tomorrow',
    /** Tomorrow card's accessible name. */
    tomorrowLabel: 'Tomorrow: {name}',
    badge: 'Next meal',
    minutes: '{minutes} min',
    size: { kcal: '{kcal} kcal' },
    /** Web: "520 kcal · 1½×". */
    sizeWithPortion: { kcal: '{kcal} kcal · {portion}' },
    /** Mobile: "1½× portion". */
    portion: '{portion} portion',
    viewRecipe: 'View recipe',
    logging: 'Logging…',
    logged: 'Logged ✓',
    ateThis: 'I ate this',
    undo: 'Undo',
    cookIt: 'Cook it',
    logError: "Couldn't log it: {error}",
    /** The name is bold on web (rich part). */
    loggedName: 'Logged {name}.',
    loggedLabel: 'Logged {name}. Change it in your full day',
    changeInFullDay: 'Change it in your full day',
    // The mobile shell's card: Eaten · Cook now · Swap · Skip.
    openLabel: '{meal}: {name}, {meta}',
    openHint: 'Opens the recipe',
    eaten: 'Eaten',
    eatenDone: 'Eaten ✓',
    eatenLabel: '{name} logged',
    markEaten: 'Mark {meal} as eaten',
    eatenFloat: { kcal: '+{kcal} kcal' },
    cookNow: 'Cook now',
    cookNowLabel: 'Cook {name} now',
    swap: 'Swap',
    swapLabel: 'Swap {meal}',
    skip: 'Skip',
    skipLabel: 'Skip {meal}',
    snackLogged: 'Logged {name}',
    snackLogError: "Couldn't log it. {error}",
    snackUndoError: "Couldn't undo that. {error}",
  },

  // ─── Web dashboard page ────────────────────────────────────────────────────
  page: {
    loadError: 'Couldn’t load your dashboard',
    weekReady: {
      title: 'Your week is ready',
      body: 'The chef prepared this week’s plan for you on Sunday.',
      bodyRated: {
        one: 'The chef prepared this week’s plan for you on Sunday — built from <strong>{count}</strong> dish you rated.',
        other:
          'The chef prepared this week’s plan for you on Sunday — built from <strong>{count}</strong> dishes you rated.',
      },
    },
    profile: {
      title: 'Complete your profile',
      body: 'Tell the AI chef your goals, body metrics and dietary needs so your meal plans are built for you.',
      cta: 'Set up now',
    },
    fullDay: 'See full day',
    caughtUp: 'You’re all caught up for today!',
    viewPlan: 'View full plan →',
    emptyWeek: {
      title: 'Your weekly menu awaits',
      premium: 'Let the chef craft a personalised 7-day plan for you.',
      free: 'Get a 7-day plan of chef-curated recipes that respect your allergies.',
      cta: 'Generate My Week',
    },
    laterToday: 'Later today',
    mealValue: { kcal: '{value} kcal' },
    outlook: {
      title: 'Weekly Outlook',
      fullSchedule: 'Full Schedule →',
      todayMeals: 'Today’s Meals',
      past: '{day} {date} — Past',
      upcoming: '{day} {date} — Upcoming',
      noMeals: 'No meals planned for this day.',
    },
    chart: {
      titleProtein: 'This Week — Protein',
      title: { kcal: 'This Week — Calories' },
      fullProgress: 'Full Progress →',
      tooltipProtein: '{value} g protein',
      tooltip: { kcal: '{value} kcal' },
    },
    weekAverage: { kcal: 'This week you averaged {kcal} kcal · {protein} g protein a day' },
    favourites: {
      title: 'Recent Favourites',
      viewAll: 'View All →',
      meta: '{cuisine} · {minutes}m',
      empty: 'Save a recipe to see it here.',
      goToPlanner: 'Go to Meal Planner →',
    },
    signOff: 'You’ve got this, chef.',
  },
} as const;
