// Lane J phase 4, `today.engagement.*`: mealtime reminder settings, the
// notifications screen, onboarding V4's steps, the weekly recap screens and
// the public share-card page. The reminder and recap copy objects themselves
// are in ./shared.ts (`today.reminders.*`, `today.recap.*`).
export const todayEngagement = {
  // ─── Settings → Notifications → Mealtime reminders ───────────────────────────
  reminderSettings: {
    /** The row's accessible names and the time sheet's title. */
    reminder: {
      breakfast: 'Breakfast reminder',
      lunch: 'Lunch reminder',
      snack: 'Snack reminder',
      dinner: 'Dinner reminder',
    },
    timeLabel: '{reminder} time, {time}. Change',
    saveTime: 'Save time',
    /** The Android notification channel's name (Android Settings → Notifications). */
    channel: 'Mealtime reminders',
  },

  // ─── Settings → Notifications ────────────────────────────────────────────────
  notifications: {
    title: 'Notifications',
    training: {
      title: 'Training reminders',
      on: 'On, at {time}',
      off: 'Off',
      label: 'Training reminders. {summary}',
    },
    restTimer: {
      title: 'Rest-timer alerts',
      body: 'A “Rest is over” alert when Chefer is in the background during a workout or a cooking timer.',
      on: 'On',
      enable: 'Turn on alerts',
      off: 'Rest-timer alerts are off',
    },
    foodNudges: 'Food nudges',
  },

  // ─── Onboarding V4 (ONBOARDING_V4_COPY and its tiles) ────────────────────────
  onboarding: {
    continue: 'Continue',
    jobs: {
      title: 'What brings you here?',
      lede: 'Pick any.',
      tiles: {
        PLAN_MEALS: 'Plan my meals',
        TRAIN: 'Train',
        TRACK: 'Track food',
        HOUSEHOLD: 'Feed my family',
        USE_WHAT_I_HAVE: 'Use what I have',
        SAVED_RECIPES: 'Cook my saved recipes',
      },
    },
    goal: {
      title: 'What’s your goal?',
      tiles: {
        LOSE_WEIGHT: 'Lose weight',
        GAIN_MUSCLE: 'Build muscle',
        EAT_HEALTHIER: 'Eat healthier',
        GOOD_FOOD: 'Just good food',
        MAINTAIN: 'Stay where I am',
        RECOMP: 'Lose fat, build muscle',
        PERFORMANCE: 'Train for performance',
      },
    },
    about: {
      title: 'About you',
      sex: 'Sex',
      female: 'Female',
      male: 'Male',
      age: 'Age',
      ageUnit: 'yrs',
      height: 'Height',
      weight: 'Weight',
      /** A number field's accessible name: "Age, yrs". */
      fieldLabel: '{label}, {unit}',
      trainOn: 'I train on',
      /** One-letter weekday buttons, Monday first. */
      dayLetters: {
        mon: 'M',
        tue: 'T',
        wed: 'W',
        thu: 'T',
        fri: 'F',
        sat: 'S',
        sun: 'S',
      },
      target: 'Your daily target',
      targetUnit: { kcal: 'kcal' },
      targetChange: 'Change',
      targetChangeLabel: 'Change activity level',
      activityTitle: 'How active are you?',
      activity: {
        SEDENTARY: 'Sedentary',
        LIGHTLY_ACTIVE: 'Lightly Active',
        MODERATELY_ACTIVE: 'Moderately Active',
        VERY_ACTIVE: 'Very Active',
        ATHLETE: 'Athlete',
      },
    },
    safety: {
      title: 'Anything you can’t eat?',
      lede: 'We check every meal against it.',
      everything: 'I eat everything',
      orPick: 'Or pick',
      more: 'More options',
      build: 'Build my week',
      chips: {
        vegetarian: 'Vegetarian',
        vegan: 'Vegan',
        nuts: 'Nuts',
        peanuts: 'Peanuts',
        dairy: 'Dairy',
        gluten: 'Gluten',
        eggs: 'Eggs',
        fish: 'Fish & shellfish',
      },
    },
    building: {
      title: 'Building your week…',
      meals: { kcal: '21 meals around {value} kcal' },
      mealsNoTarget: 'A week of balanced meals',
      diet: 'Checked against your diet',
      list: 'Writing your shopping list',
      failed: 'We couldn’t build your week just now.',
      retry: 'Try again',
      skip: 'Skip for now',
    },
    ready: {
      title: 'Your week is ready',
      lede: 'Dinners shown. Breakfast and lunch are in too.',
      dinner: { kcal: '{value} kcal' },
      list: { one: '{count} item on your list', other: '{count} items on your list' },
      continue: 'Looks good',
      later: 'I’ll tweak it later',
    },
    premium: {
      eyebrow: 'PREMIUM',
      title: 'Free for you, for now',
      perks: {
        chef: 'Ask the AI chef',
        photo: 'Log meals by photo',
        import: 'Import recipes from videos',
        weekly: 'Your week, ready every Monday',
      },
      note: 'No card. Nothing to cancel.',
      turnOn: 'Turn on Premium',
      later: 'Maybe later',
      onTitle: 'Premium is on',
      onTicks: {
        chef: 'AI chef',
        photo: 'Photo meal logging',
        import: 'Recipe import',
        weekly: 'Weekly auto-plan',
      },
      failed: 'Couldn’t turn on Premium. Nothing has changed.',
    },
    train: {
      title: 'Set up training',
      style: 'How do you like to train?',
      experience: 'Lifting experience',
      experienceNew: 'New or returning',
      experienceExperienced: 'Experienced',
      where: 'Where you train',
      whereGym: 'Gym',
      whereDumbbells: 'Dumbbells',
      whereBodyweight: 'Bodyweight',
      fits: {
        one: 'Fits your {count} training day',
        other: 'Fits your {count} training days',
      },
      change: 'Change',
      changeLabel: 'Change program',
      start: 'Start training',
    },
    leave: {
      title: 'Leave setup?',
      body: 'You can finish it any time from Settings.',
      confirm: 'Leave',
      cancel: 'Keep going',
    },
  },

  // ─── Your week in review ─────────────────────────────────────────────────────
  recapScreen: {
    /** A personal best under Training: "Bench press: 80 kg". */
    pr: '{exercise}: {value}',
    /** The Today card's accessible name: "Your week in review, 12–18 Oct". */
    todayCardLabel: '{title}, {week}',
  },

  // ─── The public share-card page (/s/[id], share-card-lines.ts) ───────────────
  share: {
    pageTitle: 'Chefer',
    shows: 'What this card shows',
    pitch: 'Plan your week, cook it, and train — with Chefer.',
    tryWeb: 'Try Chefer on the web',
    eyebrow: {
      recipe: 'From my Chefer kitchen',
      cook: 'Cooked it with Chefer',
      workout: 'Workout done',
      recap: 'My week · {week}',
    },
    recapTitle: 'Week in review',
    stats: {
      minutes: '{value} min',
      startToFinish: 'start to finish',
      servings: { one: 'serving', other: 'servings' },
      perServing: 'per serving',
      perServingValue: { kcal: '{value} kcal' },
      proteinPerServing: 'protein per serving',
      proteinGrams: '{value} g',
      newBest: 'New best: {exercise}',
      exercises: { one: 'exercise', other: 'exercises' },
      sets: { one: 'set', other: 'sets' },
      ofTraining: 'of training',
      cookedFromPlan: { one: 'meal cooked from my plan', other: 'meals cooked from my plan' },
      newRecipesTried: { one: 'new recipe tried', other: 'new recipes tried' },
      proteinDaysValue: '{hit} of {logged}',
      proteinDays: 'days at my protein goal',
      workouts: { one: 'workout', other: 'workouts' },
      prCount: { one: 'new personal best', other: 'new personal bests' },
      streakValue: '{count}-week',
      streak: 'training streak',
    },
  },
} as const;
