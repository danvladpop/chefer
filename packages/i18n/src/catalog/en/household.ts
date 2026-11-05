// Lane J phase 4. Household sharing: invite, join, partner mode, the shared week and live list (lane I),
// and the household editor (web Preferences section, mobile Household screen).
export const household = {
  // Moved from HOUSEHOLD_SHARING_COPY in @chefer/types (key names follow its fields).
  sharing: {
    inviteButton: 'Invite to Chefer',
    /** The invite button's accessible name. */
    inviteButtonLabel: 'Invite to Chefer: {name}',
    /** The list of join / leave notices. */
    noticesLabel: 'Household news',
    inviteSheetTitle: 'Invite {name}',
    inviteSheetBody:
      "{name} gets their own Chefer account, sees this week's meals and ticks the shopping list with you. Their food log, weight and targets stay private, and so do yours.",
    inviteExpires: 'The link works once and expires in 14 days.',
    /** The text the share sheet sends before the link. */
    shareMessage: '{ownerName} invited you to share meal plans and the shopping list on Chefer: ',
    copyLink: 'Copy link',
    shareLink: 'Share link',
    revoke: 'Cancel invite',
    invitePending: 'Invite sent',
    joinedBadge: 'Has Chefer',
    joinTitle: "Join {ownerName}'s household",
    joinLede:
      '{ownerName} added you as {profileName}. Join to plan the week together and share one shopping list.',
    joinShares: {
      week: 'You both see and change the same week of meals.',
      list: 'Ticks on the shopping list show up for both of you within seconds.',
      safety:
        'Your allergies, diet and dislikes below are shared with the household, so every meal is safe for you.',
    },
    joinPrivate:
      'Your food log, weight and targets stay private. Nobody in the household sees them.',
    joinSafetyTitle: 'Check your allergies and diet',
    joinSafetyHint: 'These came from the household. Fix anything that is wrong before you join.',
    joinPortion: 'You eat {portion} of each meal. You can change it later.',
    /** The words that fill {portion} in joinPortion (householdPortionPhrase). */
    portion: {
      standard: 'a standard portion',
      /** The app's wording for a factor of 1. */
      full: 'a full portion',
      quarter: 'a quarter portion',
      half: 'half a portion',
      threeQuarters: 'three-quarters of a portion',
      fraction: '{value} of a portion',
      many: '{value} portions',
    },
    joinAllow: 'Join household',
    joinDecline: 'Not now',
    joinOwnPlansNote: 'Your own meal plans are kept. They come back if you leave.',
    joinPageTitle: 'Join a household',
    joinSafetyLists: {
      allergies: 'Allergies',
      dietaryRestrictions: 'Diet',
      dislikedIngredients: 'Dislikes',
    },
    joinSafetyNone: 'None',
    joinSafetyAdd: 'Add',
    joinSafetyAddLabel: {
      allergies: 'Add to allergies',
      dietaryRestrictions: 'Add to diet',
      dislikedIngredients: 'Add to dislikes',
    },
    joinSafetyRemove: 'Remove {term}',
    signedOutTitle: 'Join a household on Chefer',
    signedOutBody:
      'Someone you cook with sent you this invite. Open it in the Chefer app to see whose household it is and join.',
    signedOutNoApp: 'No app yet? Get it free, then open your invite link again.',
    openInApp: 'Open in the Chefer app',
    continueOnWeb: 'Continue on the web',
    copied: 'Link copied',
    copyFailed: 'Couldn’t copy the link. Select it and copy it yourself.',
    inviteLoadFailed: 'Couldn’t make the invite link. Try again.',
    tryAgain: 'Try again',
    you: 'You',
    dismissNotice: 'Dismiss',
    cancel: 'Cancel',
    goToMeals: 'Go to Meals',
    // HOUSEHOLD_MOBILE_COPY (apps/mobile household/sharing/copy.ts): the app's own lines.
    app: {
      offlineJoin: 'Connect to the internet to join.',
      signedOutBody:
        'Sign in or create a free account to join. You’ll come straight back to this invite.',
      signIn: 'Sign in',
      createAccount: 'Create account',
    },
    inviteState: {
      NOT_FOUND: "This invite link doesn't work. Ask for a new one.",
      SELF: "That's your own invite. Send it to the person you cook for.",
      ALREADY_JOINED: "You're already in this household.",
      IN_OTHER_HOUSEHOLD:
        "You're in {owner}'s household. Leave it first, then open this link again.",
      HAS_PARTNERS:
        'People have joined your own household. Remove them first if you want to join this one.',
      PROFILE_TAKEN: 'Someone has already joined with this invite. Ask for a new one.',
      USED: 'This invite has already been used. Ask for a new one.',
      REVOKED: 'This invite was cancelled. Ask for a new one.',
      EXPIRED: 'This invite has expired. Ask for a new one.',
    },
    partnerBanner: "You're sharing {ownerName}'s week and shopping list.",
    ownerOnly:
      'Only {ownerName} can do this, because the week is planned on their goals. You can swap, replace and pin meals.',
    leave: 'Leave household',
    leaveConfirm:
      "Leave {ownerName}'s household? You'll stop seeing the shared week and list, and your own plans come back. Your profile, with your allergies, stays in the household so meals stay safe for you.",
    remove: 'Remove from household',
    removeConfirm:
      'Remove {name}? They stop seeing your week and list. Their profile and allergies stay; you can delete the profile afterwards.',
    claimedProfileNote: '{name} manages their own allergies and diet.',
    conflict: "{name} changed this meal a moment ago. Here's the latest week.",
    conflictSomeone: 'This meal changed a moment ago. Here’s the latest week.',
    checkedBy: 'Ticked by {name}',
    checkedByYou: 'Ticked by you',
    addedBy: 'Added by {name}',
    addedByYou: 'Added by you',
    notice: {
      HOUSEHOLD_PARTNER_JOINED: '{name} joined your household.',
      HOUSEHOLD_PARTNER_LEFT: '{name} left your household.',
      HOUSEHOLD_REMOVED: '{name} removed you from their household. Your own plans are back.',
      HOUSEHOLD_ENDED: '{name} stopped using Chefer. Your plan is your own again.',
    },
  },

  // The household editor: web Preferences "My household" (household-section.tsx)
  // and the mobile Household screen (household-editor.tsx, app/household.tsx).
  editor: {
    sectionTitle: 'My household',
    screenTitle: 'Household',
    sectionIntro:
      'Add the people you cook for. Their allergies and restrictions apply to every plan — free. Premium also scales servings and the shopping list to the whole table.',
    screenIntro:
      'Who eats with you? Everyone’s allergies and restrictions apply to every plan, free. With Premium, portions, the shopping list and the week cost scale to your whole table.',
    cookingFor: 'cooking for {portions}',
    atTable: '{people} at the table',
    tableSummary: '{people} at the table · we’ll check for {list}',
    tableRule: '{label} ({who})',
    listAnd: '{list} and {last}',
    you: 'You',
    youLoadError: 'Couldn’t load your allergies and diet. Nothing has been changed.',
    youLoading: 'Loading your allergies and diet…',
    retry: 'Retry',
    allergiesAndDietFor: 'Allergies & diet for {name}',
    allergiesAndDietForYou: 'Allergies & diet for you',
    allergiesAndDietForSomeone: 'Allergies & diet for this person',
    saveChanges: 'Save changes',
    addToTable: 'Add to my table',
    editTitle: 'Edit {name}',
    addTitle: 'Add someone to your table',
    addSomeone: 'Add someone',
    addSomeoneElse: 'Add someone else',
    sheetDescription:
      'Their allergies and restrictions become hard rules for every plan. Portion size sets how much of each dish is theirs.',
    name: 'Name',
    namePlaceholderKid: 'e.g. Sam',
    namePlaceholderAdult: 'e.g. Maria',
    nameHintKid: 'Name — e.g. Sam',
    nameHintAdult: 'Name — e.g. Maria',
    portionSize: 'Portion size',
    portionHint: 'Relative to one standard serving — a kid eats about half.',
    /** Web portion chips, by portion factor (½ … 1½). */
    portionChip: {
      p50: '½ · kid',
      p75: '¾ · light',
      p100: '1 · standard',
      p125: '1¼ · hearty',
      p150: '1½ · big eater',
    },
    portion: '{portion} portion',
    agePortion: '{age} · {portion} portion',
    isKid: 'This is a kid',
    child: 'Child',
    childHint: 'Child (smaller portions)',
    kidBadge: 'Kid',
    kidBadgeAge: 'Kid · {age}',
    age: 'Age',
    optional: '(optional)',
    ageOptional: 'Age (optional)',
    ageLabel: 'Age {range}',
    chipPartner: '+ add your partner',
    chipKid: '+ add a kid',
    presetPartner: '+ My partner',
    presetKid: '+ A kid',
    summaryAllergicTo: 'allergic to {list}',
    summaryDislikes: 'dislikes {list}',
    summaryNone: 'no restrictions',
    summaryAllergic: 'allergic: {list}',
    summaryWontEat: 'won’t eat: {list}',
    editLabel: 'Edit {name}',
    removeLabel: 'Remove {name}',
    removeConfirm: 'Remove {name}? Their allergies stop applying to your plans.',
    keep: 'Keep',
    remove: 'Remove',
    removing: 'Removing…',
    ofLimit: '{used} of {limit}',
    atCap: {
      one: 'You’ve reached the limit of {count} household member.',
      other: 'You’ve reached the limit of {count} household members.',
    },
    loadError: 'Couldn’t load your household. Nothing has been changed.',
    loadErrorTitle: 'Couldn’t load your household',
    loadErrorBody: 'Nothing has been changed. Check your connection and try again.',
    emptyTable: 'Just you at the table for now.',
    emptyHint: 'Tap “{kid}” or “{partner}” below to see your week with them.',
    freeNote: {
      one: 'Everyone’s allergies already apply to every plan. Your shopping list and servings are still sized for one portion — Premium scales them for your table of {people} ({count} portion).',
      other:
        'Everyone’s allergies already apply to every plan. Your shopping list and servings are still sized for one portion — Premium scales them for your table of {people} ({count} portions).',
    },
    upsellTitle: 'Everyone’s allergies apply to every plan — free.',
    upsellBody: {
      one: 'Your shopping list and servings are still sized for one portion. Premium scales them for your table ({count} portion), kids at half portions included.',
      other:
        'Your shopping list and servings are still sized for one portion. Premium scales them for your table ({count} portions), kids at half portions included.',
    },
    upsellCta: 'See what Premium adds',
    // The free-tier ghost sample (web; F-PM-12).
    ghost: {
      title: 'Sample: your week with {name}',
      body: 'Say you add {name} — {summary}. Every dinner would be safe for you both:',
      summary: {
        kid: 'a kid — ½ portion, allergic to peanuts',
        partner: 'vegetarian, a full portion',
      },
      dishes: {
        mon: 'Chickpea & Roast Pepper Tagine',
        tue: 'Miso Ginger Noodle Stir-fry',
        wed: 'Charred Broccoli Rice Bowls',
      },
      noItem: 'no {item}',
      combinedRules: 'Combined table rules: {rules}',
      addKidFree: 'Add a kid — free',
      addPartnerFree: 'Add your partner — free',
      upsell: {
        one: 'Allergies are free. Premium also sizes servings and the shopping list for {count} portion.',
        other:
          'Allergies are free. Premium also sizes servings and the shopping list for {count} portions.',
      },
    },
  },
} as const;
