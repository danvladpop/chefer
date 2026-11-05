export const settings = {
  language: {
    title: 'Language',
    description: 'The language Chefer uses for screens and emails.',
    automatic: 'Same as my phone',
    automaticWeb: 'Same as my browser',
    automaticHint: 'Currently {language}',
    saved: 'Language updated',
    // Each language names itself, so someone who picked the wrong one can find their way back.
    names: {
      en: 'English',
      ro: 'Română',
    },
  },
  hub: {
    title: 'Settings',
    groups: {
      you: 'You',
      food: 'Food',
      training: 'Training',
      account: 'Account',
      legal: 'Legal',
    },
    rows: {
      jobs: 'What you use Chefer for',
      goalBody: 'Goal & body',
      targets: 'Your targets',
      safety: 'Allergies & diets',
      household: 'Household',
      moneyUnits: 'Money & units',
      budget: 'Weekly budget',
      autoPlan: 'Plan my week automatically',
      trainingDays: 'Training days & reminders',
      pause: 'Pause training',
      gymUnits: 'Units, equipment & weekly goal',
      workoutHistory: 'Workout history',
      exportWorkouts: 'Export workouts',
      planPremium: 'Plan & Premium',
      emails: 'Emails',
      notifications: 'Notifications',
      privacyData: 'Privacy & data',
      accountData: 'Download or delete my data',
      terms: 'Terms of Service',
      privacyPolicy: 'Privacy Policy',
      signOut: 'Sign out',
    },
    trainingSetup: {
      title: 'Training isn’t set up yet',
      body: 'Choose your training days, units and equipment to start logging workouts. Everything else in Chefer works without it.',
      cta: 'Set up training',
    },
  },
  // Titles a Settings row promises, used as the screen title when a screen is
  // opened with `?section=<id>` (section-anchor.tsx). The rest reuse hub.rows.
  sections: {
    weeklyUpdates: 'Weekly updates',
    account: 'Your data & account',
  },
  account: {
    title: 'Account',
    planFree: 'Free',
    planPremium: 'Premium',
    disclaimer:
      "Chefer suggests meals and workouts as general guidance only. It isn't a medical device. Suggestions, including AI ones, can be wrong, even about allergens.",
  },
  you: {
    helpTitle: 'Help',
    feedback: 'Send feedback',
    feedbackHint: 'Tell us what is broken, confusing or missing',
    feedbackThanks: 'Thanks, we read every note.',
    support: 'Support',
    terms: 'Terms',
    privacy: 'Privacy',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  signOut: {
    title: 'Sign out of Chefer?',
    body: 'You can sign back in any time.',
    confirm: 'Sign out',
    unsyncedTitle: 'Sign out and lose workouts?',
    unsyncedBody: {
      one: '{count} workout hasn’t synced to your account yet. Signing out now deletes it from this phone.',
      other:
        '{count} workouts haven’t synced to your account yet. Signing out now deletes them from this phone.',
    },
    unsyncedConfirm: 'Sign out anyway',
    unsyncedCancel: 'Stay signed in',
  },
  jobs: {
    title: 'What you use Chefer for',
    loadError: "Couldn't load your settings",
    discardTitle: 'Discard your changes?',
    discardMessage: 'Your selections have not been saved.',
    setUpTrainingPrompt: 'Set up training now?',
    setUpFoodPrompt: 'Set up your food — 3 quick questions?',
    setUp: 'Set up',
  },
} as const;
