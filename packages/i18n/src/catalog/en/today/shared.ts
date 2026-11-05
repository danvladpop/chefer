// Lane J phase 4. The copy objects of lanes D and E, moved from @chefer/utils
// (PROGRESS_PHOTOS_COPY, MEASUREMENTS_COPY, PARTLY_LOGGED_COPY, the coach's
// "why", ENGAGEMENT_COPY, MEAL_REMINDER_NOTIFICATION, RECAP_COPY,
// HIDE_NUMBERS_COPY, NUMBERS_MODE_COPY). Warm, never guilt-based, never a
// shortfall: today-copy-audit.test.ts scans every string here.
export const todayShared = {
  // ─── Progress photos (lane D4) ─────────────────────────────────────────────
  photos: {
    title: 'Progress photos',
    privacy:
      'Saved only on this phone, never uploaded. Deleting the app deletes them — share a photo to keep a copy.',
    exportNote: 'Progress photos stay on your phone, so they aren’t in the export.',
    web: 'Progress photos live on your phone: open the Chefer app to take and compare them. They are never uploaded.',
    empty:
      'No photos yet. Take one in the same spot and light each time, and compare them side by side.',
    takePhoto: 'Take photo',
    choosePhoto: 'Choose photo',
    compare: 'Compare',
    pickTwo: 'Tap two photos to compare them.',
    share: 'Share',
    delete: 'Delete photo',
    deleteConfirmTitle: 'Delete this photo?',
    deleteConfirmBody: 'It’s only on this phone, so it can’t be restored.',
    shareFailed: "Couldn't share the photo from this version of the app.",
    saveFailed: "Couldn't save the photo. Try again.",
    cameraDenied: 'Camera access is off. Allow it in Settings, or choose a photo instead.',
  },

  // ─── Body measurements (lane D3) ───────────────────────────────────────────
  measurements: {
    title: 'Body measurements',
    intro: 'Track your waist, hips, chest, arms, thighs and body fat — free, and in your units.',
    add: 'Add measurements',
    save: 'Save measurements',
    saving: 'Saving…',
    saved: 'Measurements saved',
    empty: 'No measurements yet. Measure what you like — every field is optional.',
    oneEntry: 'Add another entry on a later day to see the change.',
    declined:
      'Your measurements weren’t saved, because Chefer doesn’t have permission to store health information.',
    deleteLabel: 'Delete the measurements from {day}',
    deleteError: "Couldn't delete that entry. Try again in a moment.",
    entries: 'Entries',
    labels: {
      waist: 'Waist',
      hips: 'Hips',
      chest: 'Chest',
      upperArm: 'Upper arm',
      thigh: 'Thigh',
      bodyFat: 'Body fat',
    },
    /** `parseMeasure` / `parseMeasurementForm` error codes. */
    errors: {
      format: 'Use a number like 82.5.',
      bodyFatRange: 'Body fat must be between {min} and {max} %.',
      lengthRange: 'Must be between {min} and {max} {unit}.',
      empty: 'Enter at least one measurement.',
    },
    change: {
      none: 'No change since your first entry',
      since: '{change} since your first entry',
    },
  },

  // ─── "Partly logged day" switch (lane D2) ──────────────────────────────────
  partlyLogged: {
    label: 'Partly logged day',
    detail: 'Your weekly review leaves this day out of its averages.',
    saveError: "Couldn't save that. Try again in a moment.",
  },

  // ─── The Adaptive Chef's "why", in words (lane D2, coach-explanation.ts) ───
  coachWhy: {
    title: 'Why this suggestion',
    span: {
      days: { one: '{count} day', other: '{count} days' },
      weeks: { one: '{count} week', other: '{count} weeks' },
    },
    trendSteady: 'Your trend weight held steady, from {from} to {to} over {span}.',
    trendDown: 'Your trend weight went from {from} to {to} over {span}, about {rate} a week down.',
    trendUp: 'Your trend weight went from {from} to {to} over {span}, about {rate} a week up.',
    noTrend: 'There aren’t enough weigh-ins yet to read your trend weight.',
    leftOut: {
      one: '{count} partly logged day was left out.',
      other: '{count} partly logged days were left out.',
    },
    averaged: {
      kcal: {
        one: 'Your {count} complete day averaged {avg} kcal, with a target of {target} kcal.',
        other: 'Your {count} complete days averaged {avg} kcal, with a target of {target} kcal.',
      },
    },
    noCompleteDays: 'No complete days to average this week.',
    decision: {
      plateauWithheld:
        "Your trend hasn't moved down for two weekly reviews in a row. With Premium, your chef turns that into a budget suggestion for next week.",
      plateau: {
        kcal: "Your trend hasn't moved down for two weekly reviews in a row, so I'd suggest {change} kcal a day for next week.",
      },
      gainStallWithheld:
        "Your trend isn't rising yet. With Premium, your chef turns that into a budget suggestion for next week.",
      gainStall: {
        kcal: "Your trend isn't rising yet, so I'd suggest {change} kcal a day to fuel your training next week.",
      },
      plateauWatch:
        'Your trend didn’t move down this week. One week can be water, so I’ll look again next Sunday before suggesting anything.',
      onTrack: 'Your trend is moving the way you want, so your budget stays as it is.',
      fewCompleteDays:
        'I suggest changes from at least {min} complete days, so your budget stays as it is this week.',
      noTrend:
        'Weigh in a few times a week and I can read your trend. Until then your budget stays as it is.',
      atFloor: 'Your budget is already at the lowest I suggest, so it stays as it is.',
      atCeiling: 'Your budget is already at the highest I suggest, so it stays as it is.',
      under18: 'For under-18s I keep the budget at maintenance, so it stays as it is.',
      noBodyMetrics:
        'Add your height, age and activity level in Your targets and I can suggest changes. Until then your budget stays as it is.',
      noDirection: "Your goal doesn't call for a budget change, so it stays as it is.",
    },
    data: {
      trendWeight: 'Trend weight',
      trendWeightValue: '{from} → {to}',
      weeklyRate: 'Weekly rate',
      steady: 'steady',
      weighIns: 'Weigh-ins',
      weighInsValue: '{count} over {span}',
      averageIntake: 'Average intake',
      averageIntakeValue: { kcal: '{value} kcal' },
      dailyTarget: 'Daily target',
      dailyTargetValue: { kcal: '{value} kcal' },
      completeDays: 'Complete days',
      completeDaysPartly: '{complete} (+{partly} partly logged)',
    },
  },

  // ─── Mealtime reminders (lane E1) ──────────────────────────────────────────
  reminders: {
    slots: {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      snack: 'Snack',
      dinner: 'Dinner',
    },
    notification: {
      breakfast: {
        title: 'Breakfast time',
        body: 'Enjoy your breakfast. Tap to see today’s meals.',
      },
      lunch: { title: 'Lunch time', body: 'Time for a lunch break. Tap to see today’s meals.' },
      snack: { title: 'Snack time', body: 'A good moment for a snack. Tap to see today’s meals.' },
      dinner: {
        title: 'Dinner time',
        body: 'Time to think about dinner. Tap to see today’s meals.',
      },
    },
    stepTitle: 'Remind me at mealtimes?',
    stepBody:
      'A gentle nudge when it’s time to eat, so your plan is there when you need it. Nothing on days you’ve already logged that meal.',
    stepYes: 'Yes, remind me',
    stepNo: 'Not now',
    stepLater: 'You can change the times any time in Settings → Notifications.',
    cardTitle: 'Mealtime reminders',
    cardBody: 'One gentle reminder per meal, skipped once that meal is logged.',
    masterLabel: 'Remind me at mealtimes',
    webNote: 'Reminders arrive on your phone through the Chefer app.',
    off: 'Mealtime reminders are off',
  },

  // ─── Weekly recap (lane E2) ────────────────────────────────────────────────
  recap: {
    title: 'Your week in review',
    todayCardTitle: 'Your week in review',
    todayCardBody: 'What you cooked and trained last week.',
    foodHeading: 'Food',
    gymHeading: 'Training',
    newRecipesHeading: 'New recipes you tried',
    quietTitle: 'A quiet week',
    quietBody: 'Your recap fills in as you cook, log and train.',
    foodQuiet: 'Nothing cooked or logged from your plan that week.',
    share: 'Share your week',
    shareSheetTitle: 'What goes on the card?',
    shareCooking: 'Cooking',
    shareProtein: 'Protein days',
    shareTraining: 'Training',
    shareNote: 'Your card never shows your weight, allergies or what you logged.',
    previousWeek: 'Previous week',
    nextWeek: 'Next week',
    shareMessage: 'My week with Chefer, {label}.',
    food: {
      cookedFromPlan: {
        one: '{count} meal cooked from your plan',
        other: '{count} meals cooked from your plan',
      },
      newRecipesTried: { one: '{count} new recipe tried', other: '{count} new recipes tried' },
      proteinDays: {
        one: 'Protein goal reached on {hit} of {count} logged day',
        other: 'Protein goal reached on {hit} of {count} logged days',
      },
    },
    gym: {
      sessions: { one: '{count} workout', other: '{count} workouts' },
      prCount: { one: '{count} new personal best', other: '{count} new personal bests' },
      streakWeeks: { one: '{count}-week streak', other: '{count}-week streak' },
    },
  },

  // ─── Hide numbers (lane E3) ────────────────────────────────────────────────
  hideNumbers: {
    onPlanTitle: 'Today so far',
    onPlanEmpty: 'Your meals for today are planned. Tick them off as you go.',
    onPlanDone: 'Every planned meal eaten today.',
    noPlan: 'Log what you eat to see your day here.',
    onPlanLine: {
      one: '{eaten} of {count} planned meal eaten',
      other: '{eaten} of {count} planned meals eaten',
    },
    recipeNutritionHidden: 'Nutrition is hidden in your settings.',
    weekOnPlan: 'Planned to suit you, all week.',
    estimateHidden: 'We’ll estimate it for you.',
    /** portionLabel(): "1 portion", "½ portion" (≤ 1) and "1½ portions" (> 1). */
    portion: { single: '{portion} portion', multiple: '{portion} portions' },
  },

  // ─── "What do you want to keep an eye on?" (WP-08, lane E3) ────────────────
  numbersMode: {
    question: 'What do you want to keep an eye on?',
    fullTitle: 'Calories and macros',
    fullDetail: 'Calories, protein, carbs and fat on Today and in the tracker.',
    proteinTitle: 'Just protein',
    proteinDetail: 'One number: protein. Your week still balances the rest in the background.',
    noneTitle: 'Hide numbers',
    noneDetail:
      'No calories or macros anywhere: portions and ticks instead. Your week still balances in the background.',
    /** proteinLabel(): "32 g protein". */
    protein: '{value} g protein',
    /** nutritionLabel() in full mode: "520 kcal". */
    kcal: '{value} kcal',
    /** proteinAverageText(). */
    proteinAverage: 'This week you averaged {value} g protein a day',
    /** proteinRingLabel(): "72 of 120 g protein". */
    proteinRing: '{eaten} of {target} g protein',
  },
} as const;
