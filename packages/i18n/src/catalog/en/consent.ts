// Lane J phase 2, group A. Health-information consent, AI data consent, the
// consent history and the Privacy & data section. Keep English byte-identical
// to what shipped (the source of truth for the shared copy used to be
// HEALTH_CONSENT_COPY / AI_CONSENT_COPY in @chefer/types).
export const consent = {
  health: {
    eyebrow: 'Health information',
    title: 'Can Chefer use this to plan your food?',
    intro:
      'Allergies, diets, your goal and body measurements count as health information under EU law, so we need your clear permission.',
    whatLabel: 'What',
    whatText: 'the allergies, diets and measurements you enter for you and your household',
    whyLabel: 'Why',
    whyText: 'to check and plan your meals and targets',
    whereLabel: 'Where',
    whereText:
      'stored on our servers in the EU; sent to our AI providers only when you use an AI feature (you’ll be asked separately)',
    choiceLabel: 'Your choice',
    choiceText: 'withdraw any time in Profile › Privacy & data — we delete it',
    allow: 'Allow and save',
    decline: 'Don’t save it',
    saving: 'Saving…',
    saveError: 'Couldn’t save your choice. Please try again.',
    declinedNotice: 'Without this, Chefer can’t check plans for allergies.',
    declinedBody: 'Your goal and measurements weren’t saved, so targets use the defaults.',
    declinedWeight:
      'Your weight wasn’t saved, because Chefer doesn’t have permission to store health information.',
    todayCardTitle: 'Plans aren’t being checked for allergies',
    todayCardAction: 'Allow health information',
    dismiss: 'Dismiss',
    rowTitle: 'Health information',
    rowAllowed: 'Allowed on {date}',
    rowNotAllowed: 'Not allowed. Allergies, goal and measurements aren’t stored.',
    rowAllowAction: 'Allow health information',
    withdraw: 'Withdraw and delete',
    withdrawTitle: 'Delete your health information?',
    withdrawBody:
      'This removes allergies, diets, dislikes, goal, measurements and weigh-ins for you and your household. Plans will no longer be checked for allergies.',
    withdrawKeep: 'Keep',
    withdrawDone: 'Your health information was deleted.',
    withdrawError: 'Couldn’t delete your health information. Please try again.',
  },
  ai: {
    title: 'Allow AI to use your data?',
    intro:
      'To {action}, Chefer sends some of your data to {primary}, a third-party AI service, which uses it only to produce the result.',
    sentHeading: 'What gets sent',
    noTraining: 'Your data is not used to train AI models.',
    backupProvider:
      'If {primaryShort} is busy, a request may be handled by {backups}, a backup AI service, instead.',
    control: 'We only ask once. You can turn this off at any time in Profile → AI & your data.',
    privacyLabel: 'Privacy policy',
    allow: 'Allow',
    notNow: 'Not now',
    saving: 'Saving…',
    saveError: 'Couldn’t save your choice. Please try again.',
    cardTitle: 'AI & your data',
    toggleTitle: 'Allow AI features to process my data',
    toggleOn:
      'Meal plans, meal swaps, photo scans, recipe and video imports, chat, ingredient fill-in, the AI shopping-list tidy-up and the weekly coach review send the data they need to {providers}. Not used for training.',
    toggleOff: 'Off. We’ll ask again before any AI feature sends your data.',
    coachReviewNote:
      'The weekly coach review (Premium) also uses this: it sends your weight trend, goal and average calories. Without it, the review is written from a template and nothing is sent.',
    features: {
      'meal-plan': {
        action: 'build your meal plan',
        line1: 'Your dietary preferences, allergies and disliked ingredients',
        line2:
          'Your goal and body metrics (age, sex, height, weight, activity level, calorie target)',
        line3: 'Your household members’ needs and the recipes you rated',
      },
      'meal-swap': {
        action: 'find a replacement meal',
        line1: 'Your dietary preferences, allergies and favourite cuisines',
        line2: 'The meal you are replacing',
      },
      'meal-scan': {
        action: 'estimate the nutrition in your photo',
        line1: 'The photo you take or choose',
      },
      'recipe-import': {
        action: 'read and adapt the recipe',
        line1: 'The link, text or photo you submit',
        line2:
          'For a video link: its caption and subtitles, or its audio transcribed by Groq (deleted right after)',
        line3: 'Your allergies, dietary restrictions and disliked ingredients',
      },
      chat: {
        action: 'answer your message',
        line1: 'The messages you send',
        line2: 'Your targets, allergies, restrictions, today’s meals and recent ratings',
      },
      'shopping-list': {
        action: 'tidy up your shopping list',
        line1: 'The ingredients in your meal plan',
      },
      'ingredient-estimate': {
        action: 'fill in the nutrition for your ingredient',
        line1: 'The ingredient name you typed',
      },
    },
  },
  aiGenerated: {
    label: 'AI-generated',
    a11y: 'This recipe was generated by AI',
    reviewA11y: 'This review was written by AI',
  },
  history: {
    title: 'Consent history',
    loadError: "Couldn't load your consent history",
    empty: 'Nothing recorded yet.',
    termsAccepted: 'Terms accepted',
    termsAcceptedVersion: 'Terms accepted (v{version})',
    termsDeclined: 'Terms declined',
    privacyAccepted: 'Privacy Policy accepted',
    privacyAcceptedVersion: 'Privacy Policy accepted (v{version})',
    privacyDeclined: 'Privacy Policy declined',
    age: "Confirmed you're 16 or older",
    aiAllowed: 'AI features allowed',
    aiAllowedProviders: 'AI features allowed ({providers})',
    aiRevoked: 'AI features revoked',
    analyticsAnonOn: 'Usage analytics: anonymous on',
    analyticsAnonOff: 'Usage analytics: anonymous off',
    analyticsLinked: 'Usage analytics: linked to account',
    analyticsUnlinked: 'Usage analytics: unlinked from account',
    emailWeekReadyOn: 'Weekly email (Monday): on',
    emailWeekReadyOff: 'Weekly email (Monday): off',
    emailRecapOn: 'Weekly email (Sunday recap): on',
    emailRecapOff: 'Weekly email (Sunday recap): off',
    autoPlanOn: 'Plan my week every Sunday: on',
    autoPlanOff: 'Plan my week every Sunday: off',
    healthAllowed: 'Health information allowed',
    healthWithdrawn: 'Health information withdrawn',
  },
  section: {
    heading: 'Privacy & data',
    gymSettings: 'Gym settings',
  },
} as const;
