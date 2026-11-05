// Lane J phase 4, `today.settings.*`: the numbers settings, the goal step, the
// target and protein "why" sheets, Profile, Your data and the unsubscribe page.
export const todaySettings = {
  /** A gram figure: "32 g". `protein` for protein, `macros` for carbs and fat. */
  grams: {
    protein: '{value} g',
    macros: '{value} g',
  },

  numbers: {
    showOnToday: { kcal: 'Show calories and macros on Today' },
    showOnTodayOff: 'Off: Today shows your meals and workouts, without numbers.',
    saveError: "Couldn't save that. Try again.",
  },

  proteinWhy: {
    eyebrow: 'Your protein',
    title: 'Why this protein number?',
    perDay: 'Protein a day',
    perKg: 'Per kg of bodyweight',
    atReference: 'At {value} g per kg',
  },

  targetExplain: {
    eyebrow: 'Your target',
    title: 'Why this number',
    calories: 'Calories',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    value: { kcal: '{value} kcal' },
    own: 'You set this target yourself.',
    useSuggested: 'Use the suggested target',
    setOwn: 'Set your own target',
    changeTargets: 'Change your targets',
  },

  goal: {
    title: "What's your main goal?",
    subtitle: 'Your meal plan will be optimised to support this goal.',
    goodFood: {
      title: 'Just good food',
      detail: 'No calorie target. We’ll plan balanced meals and never count for you.',
    },
    goals: {
      LOSE_WEIGHT: {
        label: 'Lose Weight',
        description: 'Reduce body fat and reach a healthier weight',
        effect: { kcal: '−500 kcal/day deficit' },
      },
      MAINTAIN: {
        label: 'Maintain Weight',
        description: 'Keep your current weight while eating well',
        effect: { kcal: 'Maintenance calories' },
      },
      GAIN_MUSCLE: {
        label: 'Gain Muscle',
        description: 'Build strength and increase lean muscle mass',
        effect: { kcal: '+300 kcal/day surplus' },
      },
      EAT_HEALTHIER: {
        label: 'Eat Healthier',
        description: 'Improve overall nutrition and eating habits',
        effect: { kcal: 'Maintenance calories, better macros' },
      },
      RECOMP: {
        label: 'Recomposition',
        description: 'Lose fat and build muscle at the same time',
        effect: { kcal: 'Maintenance calories' },
      },
      PERFORMANCE: {
        label: 'Performance',
        description: 'Fuel training and recovery, not a scale number',
        effect: { kcal: 'Maintenance calories' },
      },
    },
  },

  profile: {
    title: 'Profile',
    loadError: "Couldn't load your profile",
    tier: { premium: 'Premium', free: 'Free plan' },
    household: {
      title: 'Your household',
      justYou: 'Just you — add the people you cook for',
      atTable: {
        one: '{count} at the table: you, {names}',
        other: '{count} at the table: you, {names}',
      },
    },
    usage: {
      resetAt: 'Allowances reset at {time} your time.',
      ofLimit: '{used} / {limit}',
      unlimited: '{used} · unlimited',
      aiMealPlans: 'AI meal plans',
      curatedPlans: 'Plans from our recipes',
      chat: 'Chat messages',
      imports: 'Recipe imports read',
      scans: 'Meal photo scans',
      helperFree: 'Plans from our recipes use no AI, and free accounts can build a few a day.',
      helperPremium:
        'Plans from our recipes use no AI. An import counts when we read it; saving it is free.',
      helperPremiumSaved: {
        one: 'Plans from our recipes use no AI. An import counts when we read it; saving it is free ({count} saved today).',
        other:
          'Plans from our recipes use no AI. An import counts when we read it; saving it is free ({count} saved today).',
      },
    },
  },

  /** "Your data": export, sign out and account deletion (ACCOUNT_DELETION_COPY, DATA_EXPORT_COPY). */
  account: {
    title: 'Your data',
    signOut: 'Sign out',
    export: {
      button: 'Download my data',
      busy: 'Preparing…',
      intro:
        'Download everything Chefer stores about you, as a ZIP with spreadsheet files, or delete your account for good.',
      ready: 'Your export is ready.',
      failed: "Couldn't prepare your data. Please try again.",
      tooSoon: "You've downloaded your data a few times just now. Try again in 15 minutes.",
    },
    delete: {
      button: 'Delete account',
      title: 'Delete your account?',
      permanent: 'This permanently deletes your Chefer account. It can’t be undone.',
      listHeading: 'Deleted for good:',
      deleted: {
        profile: 'Your profile, preferences, allergies, goals and body metrics',
        plans:
          'Meal plans, shopping lists, food logs, weight entries, body measurements and pantry',
        recipes: 'Your own and imported recipes, uploaded photos, favourites and ratings',
        workouts: 'Workouts, routines and custom exercises',
        household: 'Household members, feedback, and your sign-in on every device',
      },
      backups: 'Backup copies age out within about 30 days.',
      progressPhotos:
        'Progress photos are only on your phone. Deleting your account in the app removes them; deleting the app does too.',
      passwordLabel: 'Your password',
      forgotPassword: 'Forgot your password?',
      resetSending: 'Sending…',
      resetSent:
        'We sent a reset link to {email}. It expires in one hour. Reset your password, then come back to delete.',
      reauthTitle: 'Confirm it’s you',
      reauthHint: 'Sign in with the account you use for Chefer, and your account will be deleted.',
      reauthTypeFirst: 'Type {word} below first.',
      reauthApple: 'Confirm with Apple and delete',
      reauthGoogle: 'Confirm with Google and delete',
      /** The button's spoken name: "Confirm with Apple and delete (Apple)". */
      reauthA11y: '{action} ({provider})',
      reauthUnavailable:
        'This browser can’t confirm with your connected account. Use the Chefer app, or set a password with a reset email below, then come back.',
      reauthUnavailableApp:
        'We can’t open your connected sign-in on this device. Set a password with the reset email above, then come back to delete.',
      sdkError: 'We couldn’t reach the sign-in service. Check your connection and try again.',
      confirmLabel: 'Type {word} to confirm',
      submit: 'Delete my account',
      submitting: 'Deleting…',
      cancel: 'Cancel',
    },
  },

  /** The one-click unsubscribe page (audit P2-5). */
  unsubscribe: {
    invalid: 'This unsubscribe link is invalid or has expired.',
    invalidHint: 'You can switch weekly emails off in Preferences after signing in.',
    openPreferences: 'Open Preferences',
    updating: 'Updating your email settings…',
    unsubscribed: {
      WEEK_READY: 'You\'re unsubscribed from the Monday "your week is ready" email.',
      WEEKLY_RECAP: 'You\'re unsubscribed from the Sunday "your week in review" email.',
      ALL: "You're unsubscribed from weekly emails.",
      COACHING_CHECK_IN: "You're unsubscribed from your trainer’s weekly check-in emails.",
      COACHING_QUIET_DIGEST: "You're unsubscribed from the daily “clients went quiet” email.",
    },
    resubscribed: {
      WEEK_READY: 'You\'re subscribed again to the Monday "your week is ready" email.',
      WEEKLY_RECAP: 'You\'re subscribed again to the Sunday "your week in review" email.',
      ALL: "You're subscribed again to weekly emails.",
      COACHING_CHECK_IN: "You're subscribed again to your trainer’s weekly check-in emails.",
      COACHING_QUIET_DIGEST: "You're subscribed again to the daily “clients went quiet” email.",
    },
    undo: 'Undo',
    manageAll: 'Manage all email settings',
  },
} as const;
