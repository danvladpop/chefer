// Lane J phase 4. Trainer coaching (WP-18, lane K): the client side (joining a
// trainer, the consent screen, Your trainer, find a trainer and requests,
// sharing food and weight, check-ins), the trainer's coaching views (clients,
// a client's page, invites, notes, the coach screen, went-quiet alerts) and the
// coaching emails. Moved from COACHING_COPY, COACHING_SHARING_COPY,
// COACHING_DATA_COPY, QUIET_COPY and CHECK_IN_COPY in @chefer/types; the
// English stays byte-identical to those objects.
//
// The consent texts (`consent.*`, `sharing.food`, `sharing.weight`) are the
// legal text of the COACHING_SHARING consent: change them only together with
// the privacy policy (see COACHING_CONSENT_COPY_VERSION).
export const coaching = {
  common: {
    cancel: 'Cancel',
    retry: 'Retry',
    tryAgain: 'Try again',
    copy: 'Copy',
    copied: 'Copied',
    share: 'Share',
    /** Instead of a trainer's name when that account is gone ("Changed by your trainer"). */
    fallbackTrainer: 'your trainer',
    formerTrainer: 'a former trainer',
    formerTrainerNamed: '{name} (former trainer)',
    showMore: 'Show more',
  },

  /** Coaching dates through the fixed `common` month and weekday tables ("2 Oct", "Wed 30 Sep"). */
  format: {
    dayMonth: '{day} {month}',
    weekdayDayMonth: '{weekday} {day} {month}',
  },

  // ─── Client: consent screen (join) ──────────────────────────────────────────
  consent: {
    title: '{trainer} wants to coach you in Chefer.',
    willSeeHeading: '{trainer} will see:',
    willSee: {
      routine: 'Your active routine.',
      workouts:
        'Your completed workouts (exercises, sets, weights, reps, how hard the last set felt, dates) from the last 4 weeks and from now on.',
      attendance:
        'Which planned days you trained or missed, and when you paused training (dates only, never the reason).',
    },
    canHeading: '{trainer} can:',
    can: {
      routine:
        'Change your routine (exercises, sets, reps, rest, notes on exercises) and set your weights and reps for the next session.',
      seeChanges: 'You’ll see what {trainer} changed. You can change it too.',
      book: 'Book sessions with you. You’ll see when and where; other clients in a group session never see your name.',
      log: 'Log workouts for you. They go into your history as “Logged by {trainer}”.',
    },
    privateNotes:
      '{trainer} can keep private notes about you. You won’t see them. Chefer never reads or uses them.',
    neverHeading: '{trainer} will never see:',
    never:
      'Your body measurements, allergies and diet settings, your notes on workouts, heart rate or calorie estimates, your age or profile. Your food and weight too, unless you choose to share them.',
    oneTrainer:
      'One trainer at a time. Leave whenever you want: {trainer} loses access at once and your routine stays yours.',
    switchLine: 'You’ll stop being coached by {current}.',
    allow: 'Allow and join',
    switchTo: 'Switch to {trainer}',
    notNow: 'Not now',
    needsSetup:
      'Set up your training first. It takes a minute, then you’ll come back here to join.',
    openInApp: 'Open in the Chefer app',
    continueOnWeb: 'Continue on the web',
    joinedTitle: 'You’re coached by {trainer}',
  },

  // What the invite preview says for each state (`coaching.previewInvite`).
  inviteState: {
    EXPIRED: 'This invite link has expired. Ask your trainer for a new one.',
    USED: 'This invite link was already used. Ask your trainer for a new one.',
    REVOKED: 'This invite link was cancelled. Ask your trainer for a new one.',
    NOT_FOUND: 'This invite link isn’t valid. Ask your trainer for a new one.',
    SELF: 'This is your own invite link. Send it to your client instead.',
    ALREADY_YOURS: 'You’re already coached by {trainer}.',
  },

  // ─── Client: the join flow's own words (web and mobile) ────────────────────
  join: {
    inviteTitle: 'Coaching invite',
    goToGym: 'Go to Gym',
    setUpTraining: 'Set up training',
    openMyRoutine: 'Open my routine',
    carryOn: 'Carry on joining your trainer',
    dismiss: 'Dismiss',
    offlineJoin: 'Connect to the internet to join.',
    unavailable: 'Coaching isn’t available right now.',
    offlineLeave: 'Connect to the internet to leave.',
    // Signed-out visitors (the invite preview needs an account).
    signedOutTitle: 'Join your trainer',
    signedOutBody:
      'Sign in or create a free account to join. You’ll come straight back to this invite.',
    signIn: 'Sign in',
    createAccount: 'Create account',
    // The web page a signed-out phone lands on (SignedOutInvite).
    signedOutWebTitle: 'Join your trainer on Chefer',
    signedOutWebBody:
      'Your trainer sent you this invite. Open it in the Chefer app to see who it’s from and join.',
    signedOutNoApp: 'No app yet? Get it free, then open your invite link again.',
  },

  // ─── Client: Your trainer ───────────────────────────────────────────────────
  yourTrainer: {
    title: 'Your trainer',
    noTrainer: 'You don’t have a trainer in Chefer.',
    noTrainerHint: 'If your trainer uses Chefer, ask them for an invite link.',
    since: 'Coached by {trainer} since {date}',
    stopped: '{trainer} stopped coaching you',
    seesHeading: 'What {trainer} sees',
    canHeading: 'What {trainer} can do',
    leave: 'Leave',
    leaveTitle: 'Leave {trainer}?',
    leaveBody:
      '{trainer} loses access at once. Your routine, the notes on exercises and any pending targets stay yours.',
    leaveConfirm: 'Leave trainer',
    left: 'You left your trainer',
  },

  // ─── Client: attribution lines in the routine, Today and the logger ─────────
  stamps: {
    routineChanged: '{trainer} changed your routine · {date}',
    changedBy: 'Changed by {name} · {date}',
    todayNotice: '{trainer} updated your routine · {date}',
    trainerNote: '{trainer}: {note}',
    setBy: 'Set by {name}',
    removeNote: 'Remove note',
    removeNoteFor: 'Remove note: {note}',
    conflict: '{name} changed this routine while you were editing',
  },

  /** One routine change in plain words ("+ Romanian deadlift", "Squat 3×8 → 4×6"). */
  changes: {
    added: '+ {exercise}',
    removed: '− {exercise}',
    changed: '{exercise} {from} → {to}',
    note: 'note on {exercise}',
    schedule: 'days changed',
    created: 'new routine',
    more: { one: '+ {count} more', other: '+ {count} more' },
  },

  // Consent history (Profile → Privacy → Consent history): COACHING_SHARING rows.
  consentHistory: {
    granted: 'Trainer access allowed',
    withdrawn: 'Trainer access ended',
    FOOD: { granted: 'Food log shared with your trainer', withdrawn: 'Food log no longer shared' },
    WEIGHT: { granted: 'Weight shared with your trainer', withdrawn: 'Weight no longer shared' },
  },

  // ─── Find a trainer and coaching requests (PRD 2026-10 §4.1) ────────────────
  find: {
    title: 'Find a trainer',
    entry: 'Find a trainer',
    entryHint: 'Your trainer uses Chefer? Find them by name.',
    searchLabel: 'Search trainers by name',
    searchPlaceholder: 'Trainer’s name',
    tooShort: 'Type at least 2 letters.',
    empty: 'No trainers found. Check the spelling, or ask your trainer for an invite link.',
    badge: 'Trainer',
    notTaking: 'Not taking new clients',
    unverified: 'Chefer does not verify trainers’ credentials.',
    unavailable: 'This trainer isn’t available',
  },
  request: {
    ask: 'Ask to coach me',
    askTitle: 'Ask {trainer} to coach you?',
    sendConsent: 'Allow and send request',
    sent: 'Request sent to {trainer}',
    pending: 'Waiting for {trainer} to answer',
    expires: 'Expires {date}',
    cancel: 'Cancel request',
    cancelled: 'Request cancelled',
    switchNote: 'This ends your coaching with {current} when {trainer} accepts.',
    otherPending: 'You already asked {trainer}. Cancel that request first.',
    yourTrainer: '{trainer} is your trainer.',
    noFollow: 'Asking doesn’t follow them or make your profile public.',
    // Trainer side
    listTitle: 'Requests',
    fromClient: '{client} asked you to coach them',
    hasTrainer: 'Has a trainer now: accepting ends that coaching.',
    accept: 'Accept',
    acceptFor: 'Accept: {client}',
    decline: 'Decline',
    declineFor: 'Decline: {client}',
    accepted: 'You now coach {client}',
    declined: 'Request declined',
  },

  // ─── Coaching notices (PRD 2026-10 §4.2, §4.3) ──────────────────────────────
  notices: {
    routineUpdated: '{name} updated your routine',
    clientUpdated: '{client} changed their routine',
    requestReceived: '{client} asked you to coach them',
    requestAccepted: '{trainer} is now your trainer',
    requestDeclined: '{trainer} can’t take you on right now',
    endedByTrainer: '{trainer} stopped coaching you. Your routine stays yours.',
    endedByClient: '{client} left. Their routine stays theirs.',
    trainerGone: 'Your trainer stopped using Chefer. Your routine stays yours.',
    view: 'View',
    dismiss: 'Dismiss',
    dismissFor: 'Dismiss: {title}',
    /** A card's action read with its line: "View: Ana updated your routine". */
    actionFor: '{action}: {title}',
    label: 'Coaching notices',
  },

  // ─── Lane K1: the client's food and weight sharing ──────────────────────────
  sharing: {
    heading: 'You choose what else to share',
    settingsHeading: 'What you share with {trainer}',
    food: {
      label: 'Share my food log',
      body: '{trainer} sees what you log each day: meals, calories and protein against your targets, and how closely you follow your meal plan. From the last 4 weeks and from now on, while this is on.',
      on: '{trainer} can now see your food log',
      off: '{trainer} can no longer see your food log',
    },
    weight: {
      label: 'Share my weight',
      body: '{trainer} sees your weigh-ins from the last 3 months and from now on, while this is on.',
      on: '{trainer} can now see your weight',
      off: '{trainer} can no longer see your weight',
    },
    footer:
      'Both are off unless you turn them on. Change them any time in Your trainer. Your allergies and diet settings are never shared.',
    numbersNote:
      'If you hide calories or all numbers in Chefer, your trainer sees the same: no numbers you’ve hidden.',
    saveError: 'Couldn’t save that. Try again.',
  },

  // ─── Lane K3: weekly check-ins ──────────────────────────────────────────────
  checkIn: {
    /** The fixed question catalogue (CHECK_IN_QUESTIONS); `low` / `high` label the ends of the 1–5 scale. */
    questions: {
      ENERGY: { label: 'Energy', low: 'Very low', high: 'Great' },
      HUNGER: { label: 'Hunger', low: 'Rarely hungry', high: 'Hungry all the time' },
      SLEEP: { label: 'Sleep', low: 'Poor', high: 'Great' },
      STRESS: { label: 'Stress', low: 'Calm', high: 'Very stressed' },
      ADHERENCE: { label: 'Sticking to the plan', low: 'Not at all', high: 'Fully' },
      SORENESS: { label: 'Soreness', low: 'None', high: 'Very sore' },
      MOOD: { label: 'Mood', low: 'Low', high: 'Great' },
    },
    /** One answer in a line: "Energy 3/5". */
    answer: '{label} {value}/5',
    client: {
      cardTitle: '{trainer}’s weekly check-in',
      cardBody: {
        one: '{count} quick questions and a note. It takes a minute.',
        other: '{count} quick questions and a note. It takes a minute.',
      },
      answer: 'Answer',
      later: 'Later',
      laterLabel: 'Later: {title}',

      edit: 'Change my answers',
      sentTitle: 'Sent to {trainer}',
      title: 'Weekly check-in',
      intro: '{trainer} reads this before your next session.',
      noteLabel: 'Anything else? (optional)',
      notePlaceholder: 'How the week went, what got in the way…',
      send: 'Send',
      sent: 'Check-in sent to {trainer}',
      needsAll: 'Answer every question first.',
      scaleLabel: '{question}: {value} of 5',
      closed: 'This check-in has closed. A new one opens next week.',
    },
    trainer: {
      settingsTitle: 'Weekly check-in',
      settingsBody:
        'Every client gets a few quick questions once a week, in the app and by email. You see the answers on their page.',
      enable: 'Ask my clients every week',
      dayLabel: 'Check-in day',
      questionsLabel: 'Questions (up to 6)',
      noteAlways: 'Clients can always add a note.',
      save: 'Save',
      saved: 'Check-in saved',
      cardTitle: 'Check-ins',
      off: 'Weekly check-ins are off.',
      turnOn: 'Turn on in Trainer settings',
      none: '{client} hasn’t answered a check-in yet.',
      waiting: 'This week’s check-in is waiting for {client}.',
      week: 'Week of {date}',
      showMore: 'Show more',
      quotedNote: '“{note}”',
    },
  },

  // ─── Lane K4: "client went quiet" ───────────────────────────────────────────
  quiet: {
    settingsTitle: 'Client alerts',
    quietLabel: 'Tell me when a client goes quiet after',
    days: { one: '{count} day', other: '{count} days' },
    quietHint:
      'Quiet = no workout logged, and no food logged for clients who share their food log with you.',
    digest: 'Email me a daily summary',
    digestHint: 'Once a day, only when someone is quiet.',
    save: 'Save',
    saved: 'Alerts saved',
    /** Today / Clients: replaces "N days without a workout" when food counts too. */
    row: { one: 'Nothing logged for {count} day', other: 'Nothing logged for {count} days' },
    statHint: {
      one: '{count}+ days with nothing logged',
      other: '{count}+ days with nothing logged',
    },
  },

  // ─── Trainer side ───────────────────────────────────────────────────────────
  trainer: {
    /** Tab titles of the /trainer routes. */
    pages: { coaching: 'Coaching', today: 'Trainer today', template: 'Template' },
    title: 'Trainer tools',
    backToProfile: 'Back to Profile',
    goBack: 'Go back',
    notAllowed: 'Trainer tools aren’t available for your account yet.',
    clientUnavailable: 'This client isn’t available',
    backToClients: 'Back to clients',
    /** A client's name before the clients list has loaded. */
    clientFallback: 'Client',
    editRoutine: 'Edit routine',
    clientSections: 'Client sections',
    /** The Clients list's column headings (lg+). */
    columns: {
      client: 'Client',
      since: 'Since',
      lastWorkout: 'Last workout',
      thisWeek: 'This week',
    },
    turnOnTitle: 'Coach clients in Chefer',
    turnOnBody:
      'Invite your clients, edit their routines, leave a note on an exercise and set their weights for the next session. Free during the beta.',
    displayName: 'Your name as clients see it',
    turnOn: 'Turn on',
    turnOff: 'Turn off trainer tools',
    turnOffBody:
      'Every client link ends at once and your invites stop working. Your clients keep their routines.',
    clients: 'Clients',
    clientsEmpty: 'Invite your first client',
    invite: 'Invite a client',
    inviteLabel: 'Private label (optional)',
    inviteLabelHint: 'Only you see this, for example “Maria, Tue/Thu”.',
    createLink: 'Create link',
    inviteExpires: 'Expires {date}',
    inviteStates: {
      OPEN: 'Waiting',
      USED: 'Joined',
      EXPIRED: 'Expired',
      REVOKED: 'Revoked',
    },
    revoke: 'Revoke',
    invites: {
      heading: 'Invites',
      linkName: 'Invite link',
      linkNameLower: 'invite link',
      sendThis: {
        one: 'Send this link to your client. It works once and expires in {count} days.',
        other: 'Send this link to your client. It works once and expires in {count} days.',
      },
      shareTitle: 'Chefer coaching invite',
      revokeFor: 'Revoke: {name}',
      qrShowFor: 'Show QR code: {name}',
      noLabel: 'No label',
      hideQr: 'Hide QR code',
      qrTitleFor: 'Scan to join · {label}',
    },
    sinceClient: 'Client since {date}',
    lastWorkout: 'Last workout {date}',
    noWorkoutYet: 'No workout yet',
    weekProgress: '{sessions} / {goal} this week',
    quiet: { one: 'Nothing logged for {count} days', other: 'Nothing logged for {count} days' },
    routineChangedByClient: 'Routine changed by {name} · {date}',
    tabs: { routine: 'Routine', workouts: 'Workouts', adherence: 'Adherence', notes: 'Notes' },
    // A client's Adherence tab (spec §2.5 tab 3).
    adherence: {
      lastWeeks: 'Last 8 weeks',
      lastDays: 'Last 14 days',
      weekOf: 'Week of {date}',
      sessionsOfGoal: '{sessions} / {goal}',
      week: {
        met: 'Goal met',
        flex: 'Goal met',
        under: 'Missed',
        paused: 'Paused',
        empty: 'No sessions',
        current: 'This week',
      },
      day: { trained: 'Trained', missed: 'Missed', paused: 'Paused', rest: 'Rest' },
      dayLabel: '{weekday} {date}: {state}',
      legend: '✓ trained · ✕ planned, missed · ‖ paused · · rest',
      // The app's version of the tab (a shorter badge per week, a glyph strip with its own legend).
      weekShort: {
        met: 'Met',
        flex: 'Met',
        paused: 'Paused',
        under: 'Missed',
        empty: 'No sessions',
        current: 'This week',
      },
      weekA11y: 'Week of {date}: {sessions} of {goal} sessions, {status}',
      dayWord: {
        trained: 'trained',
        missed: 'missed',
        paused: 'paused',
        planned: 'planned today',
        rest: 'rest',
      },
      dayA11y: '{date}: {state}',
      pausedGlyph: 'P',
      legendShort: '✓ trained · ✕ missed · P paused · · rest day',
    },
    // A client's Workouts tab (spec §2.5 tab 2).
    workouts: {
      empty: 'No completed workouts yet.',
      deload: 'Deload',
      skipped: 'Skipped',
      loadMore: 'Load more',
      exercise: 'Exercise',
      lastTimes: 'Last 8 times',
      rir: 'Last set: {value} in reserve',
      rirPlus: 'Last set: 3+ reps in reserve',
      notCompleted: '{set} (not completed)',
      warmup: '{set} (warm-up)',
      historyFor: '{name}, recent history',
      emptyTitle: 'No workouts yet',
      emptyBody: '{client}’s completed workouts appear here.',
      noHistory: 'No history yet.',
    },
    noteForClient: 'Note for {client}',
    noteForClientHint: '{client} will see this note under the exercise.',
    nextSession: 'Next session',
    nextDay: 'Next: {day}',
    nextDayPlanned: 'Next: {day} · planned {weekday}',
    appSuggestion: '{value} · app suggestion',
    setByYou: '{value} · set by you {date}',
    setByClient: '{value} · set by the client {date}',
    appliesTo: 'Applies the next time {client} does {exercise} ({reps} reps).',
    adjust: 'Adjust',
    adjustFor: 'Adjust: {name}',
    resetToSuggestion: 'Reset to app suggestion',
    resetToSuggestionFor: 'Reset to app suggestion: {name}',
    nextUp: 'Next up',
    adjustNextFor: 'Adjust next session target for {name}',
    exerciseFallback: 'exercise',
    lastDone: 'Last done {date}',
    curatedOnly: 'Only Chefer’s exercises can be added to a client’s routine.',
    fillFromMine: 'Fill from one of my routines',
    fillFromMineHint:
      'Copies the days into the draft below. Nothing is saved until you press Save changes.',
    fillFromMineEmpty: 'You have no routines of your own yet.',
    fillFromMineEmptyCopy: 'You have no routines of your own to copy yet.',
    routineDays: '{name}, {days}',
    // The coach screen (trainer mode M3): the trainer logging a client's workout.
    coach: {
      /** Who wrote the cue under an exercise, when it is the trainer looking. */
      you: 'You',
      loading: 'Loading the workout',
      back: 'Back',
      setsProgress: '{done}/{planned} sets',
      /** Read after a client chip's name once their workout is saved. */
      chipDone: ', done',
    },
    // The client's routine in the trainer's editor (spec §2.5 tab 1).
    routineEditor: {
      noActiveRoutine: 'This client has no active routine yet.',
      createThreeDay: 'Create a 3-day routine',
      routineName: 'Routine name',
      unsaved: 'Unsaved changes',
      saveChanges: 'Save changes',
      addExercise: 'Add exercise',
      swapExercise: 'Swap exercise',
      workoutTypeFor: 'Workout type · {day}',
      pickWorkoutType: 'Pick a workout type for this day.',
      // The app's editor (alerts, banners and the empty state).
      title: '{client}’s routine',
      discardTitle: 'Discard changes?',
      discardBody: 'Your edits to {client}’s routine have not been saved.',
      copied: { one: 'Copied {count} exercises.', other: 'Copied {count} exercises.' },
      skippedCustom: {
        one: '{count} custom exercises were skipped.',
        other: '{count} custom exercises were skipped.',
      },
      couldNotCopy: 'Could not copy',
      couldNotSave: 'Could not save',
      couldNotCreate: 'Could not create',
      couldNotReset: 'Could not reset',
      needsConnection: 'Needs a connection',
      reconnect: 'Reconnect to edit this routine.',
      noRoutineTitle: 'No active routine yet',
      noRoutineBody: '{client} has no active routine. Create a 3-day routine to start.',
      unsavedBadge: 'Unsaved',
      noChanges: 'No changes',
      offlineBanner: 'Editing a client’s routine needs a connection.',
      saveFirst: 'Save your changes to adjust next-session targets.',
      addDay: 'Add day',
      nextTargetFor: 'Next target: {name}',
    },
    privateNote: 'Private notes',
    privateNoteFailed: 'Couldn’t save. We’ll try again when you type.',
    privateNoteNotYet: 'Could not save yet.',
    noteTooLong: 'Keep the note to {max} characters or fewer.',
    privateNoteHint: 'Only you can see this. Chefer doesn’t read it, and {client} never sees it.',
    removeClient: 'Remove client',
    removeClientTitle: 'Remove {client}?',
    removeClientBody:
      '{client} keeps their routine and is told you stopped coaching them. Your private note is deleted after 30 days.',
    saveConflict: '{client} changed this routine while you were editing',
    // The invite as a QR code, for in-person sign-ups (PRD 2026-10 §4.1, S5).
    qr: {
      show: 'Show QR code',
      title: 'Scan to join',
      hint: 'Your client points their phone camera at this code to open the invite.',
      label: 'QR code of the invite',
    },

    // Trainer stops / profile (PRD 2026-10 §4.1, §4.3).
    profile: {
      gymLine: 'Gym / city (optional)',
      gymLineHint: 'Shown under your name, for example “Iron Gym, Cluj”.',
      findableNote:
        'Turning this on also turns on a private Following profile, so clients can find you by name. Your plan and workouts stay hidden.',
      turnOffWithClients: {
        one: 'Your 1 client loses you as their trainer at once and keeps their routine.',
        other: 'Your {count} clients lose you as their trainer at once and keep their routines.',
      },
      endCoaching: 'End coaching',
      keepItSimple: 'Keep it simple',
      keepItSimpleHint:
        '{client} chose “Keep it simple”: they tick exercises off instead of logging weights. Only {client} can change this.',
      doneAsPlanned: 'Done as planned',
      doneAsPlannedSets: {
        one: 'Done as planned · {count} set',
        other: 'Done as planned · {count} sets',
      },
      // A My week day's workout type in the trainer's editor (web + mobile).
      workoutType: {
        label: 'Workout type',
        set: 'Set workout type',
        change: 'Change',
        remove: 'Remove',
        none: 'No type',
        pickHint: 'Choose this day’s workout type',
        typeOnly: '{type} · no exercises. {client} ticks it off when it’s done.',
        setFor: 'Set workout type: {day}',
        changeFor: 'Change workout type: {day}',
        removeFor: 'Remove: {day}',
      },
      feedback: 'Send feedback',
    },

    // Lane K2: a client's shared food and weight (client page).
    data: {
      week: {
        title: 'Last 7 days',
        workoutsOfGoal: {
          one: '{done} of {count} workouts',
          other: '{done} of {count} workouts',
        },
        workouts: { one: '{count} workout', other: '{count} workouts' },
        daysLogged: 'Food logged {days} of 7 days',
        avgKcal: '{avg} of {target} kcal a day',
        avgKcalNoTarget: '{avg} kcal a day',
        avgProtein: '{avg} of {target} g protein a day',
        avgProteinNoTarget: '{avg} g protein a day',
        plan: '{pct}% of planned meals eaten as planned',
        noPlan: 'No meal plan this week',
        weightLatest: '{weight} · {date}',
        weightChange: '{change} in 7 days',
        weightSteady: 'Steady over 7 days',
        noWeighIn: 'No weigh-in yet',
        notShared: '{client} doesn’t share food or weight with you.',
        notSharedHint: 'Clients choose this in Your trainer. Ask them if it would help.',
        numbersHidden: '{client} hides numbers in Chefer, so you see meals only.',
        caloriesHidden: '{client} hides calories in Chefer.',
      },
      tab: 'Food',
      food: {
        heading: 'Food log',
        sharedSince: 'Shared since {date}',
        nothingLogged: 'Nothing logged',
        meals: { one: '{count} meal', other: '{count} meals' },
        kcal: '{kcal} / {target} kcal',
        kcalNoTarget: '{kcal} kcal',
        protein: '{g} / {target} g protein',
        proteinNoTarget: '{g} g protein',
        plan: '{eaten} of {planned} planned',
        onPlan: 'From the plan',
        notShared: '{client} doesn’t share their food log.',
      },
      weight: {
        heading: 'Weight',
        notShared: '{client} doesn’t share their weight.',
        empty: 'No weigh-ins in the last 3 months.',
      },
    },
  },

  // ─── Coaching emails (apps/api/src/lib/email/templates.ts) ──────────────────
  email: {
    checkIn: {
      subject: '{trainer}’s weekly check-in',
      preheader: 'A minute to tell your trainer how the week went.',
      body: '{trainer} asks how your week went: a few quick questions and an optional note. Open Chefer to answer.',
      cta: 'Answer in Chefer',
      unsubscribe: 'Stop check-in emails',
    },
    quiet: {
      subject: { one: '1 client went quiet', other: '{count} clients went quiet' },
      preheader: 'Who hasn’t logged anything lately.',
      intro: {
        one: 'These clients haven’t logged a workout (or food, if they share it with you) for {count}+ days:',
        other:
          'These clients haven’t logged a workout (or food, if they share it with you) for {count}+ days:',
      },
      line: {
        one: '{name}: nothing logged for {count} days',
        other: '{name}: nothing logged for {count} days',
      },
      more: { one: 'and {count} more', other: 'and {count} more' },
      cta: 'Open your clients',
      unsubscribe: 'Stop these emails',
    },
  },
} as const;
