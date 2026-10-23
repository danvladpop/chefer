// Server-sent email (apps/api/src/lib/email/templates.ts). Each email is
// rendered in the recipient's language: User.locale, then User.deviceLocale.
export const email = {
  greeting: 'Hi {name},',
  greetingNoName: 'Hi,',
  weeklyFooter: {
    reasonMonday: 'You get this Monday email because weekly emails are on for your Chefer account.',
    reasonSunday: 'You get this Sunday recap because weekly emails are on for your Chefer account.',
    unsubscribe: 'Unsubscribe',
    preferences: 'Email preferences',
  },
  weekReady: {
    subjectWithTotal: 'Your week is ready: {dinners}, {total} shopping list',
    subject: 'Your week is ready: {dinners} planned',
    intro: 'Your week of {week} is ready.',
    sourceChefRated: {
      one: 'Your chef planned it on Sunday, around your targets and the dish you rated.',
      other:
        'Your chef planned it on Sunday, around your targets and the {count} dishes you rated.',
    },
    sourceChef: 'Your chef planned it on Sunday, around your targets and preferences.',
    sourceCurated:
      'We picked a fresh week of recipes on Sunday that fit your allergies and daily targets.',
    sourceTemplate: 'The saved week you follow in My weeks repeats this week.',
    sourceYours: "Here's the week you planned.",
    dinnersHeading: 'Dinners this week:',
    listTotal: 'Estimated shopping list: {total}.',
    listReady: 'Your shopping list is ready too.',
    seeWeek: 'See your week',
    openList: 'Open the shopping list',
    shoppingList: 'Shopping list',
    upsell: 'Premium weeks learn from the dishes you rate and what is already in your pantry.',
    preheader: '{dinners} planned for {week}.',
  },
  recap: {
    subjectLogged: 'Your week in review: {meals} logged, {days} on target',
    subject: 'Your week in review',
    intro: "Here's your week of {week}.",
    mealsAcrossDays: '{meals} logged across {days}',
    daysOnTarget: {
      one: '{count} day on your calorie target',
      other: '{count} days on your calorie target',
    },
    weight: 'Weight: {change}',
    workouts: { one: '{count} workout finished', other: '{count} workouts finished' },
    quiet:
      'No meals logged this week, and that is fine. Logging even a few days next week makes this recap (and your targets) much more useful.',
    chefReview: "Your chef's weekly review is waiting on Progress.",
    upsell: 'Premium adds a weekly chef review that adjusts your targets from these numbers.',
    nextWeekPlanned: 'Next week is already planned: {dinners}.',
    seeProgress: 'See your progress',
    seeNextWeek: 'See next week',
    weightChangeSince: '{change} since your previous weigh-in',
    weightSteady: 'steady since your previous weigh-in',
  },
  verify: {
    subject: 'Confirm your email for Chefer',
    intro:
      'Confirm this address to get your Monday "your week is ready" email and the Sunday recap.',
    linkText: 'Confirm your email (link valid for 7 days):',
    button: 'Confirm my email',
    validity: 'This link is valid for 7 days.',
    notYou: "If you didn't create a Chefer account, ignore this email.",
    preheader: 'One tap to get your weekly plan by email.',
  },
  passwordReset: {
    subject: 'Reset your Chefer password',
    intro: 'Someone requested a password reset for your Chefer account.',
    linkText: 'Reset your password (link valid for 1 hour):',
    notYou: "If this wasn't you, ignore this email — your password is unchanged.",
  },
} as const;
