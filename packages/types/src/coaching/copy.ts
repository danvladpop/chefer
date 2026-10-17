// ─── Trainer coaching copy deck (spec §2.3, §2.6, §2.7) ───────────────────────
// Every user-visible string that must read the same on web and mobile lives
// here: the consent screen, "Your trainer", the attribution lines, the invite
// states and the server's error messages. Strings that interpolate are small
// functions; dates are formatted by the app ("2 Oct") and passed in. Apostrophes
// are typographic (’). Romanian strings follow the app's normal i18n path.
//
// The consent screen text is the legal text of the COACHING_SHARING consent
// (spec §8.2): change it only together with the privacy policy, and bump
// LEGAL_VERSIONS.privacy (owner action).

import type { RoutineChange } from './dto';

/** Shown instead of a trainer's name when that account is gone ("Changed by your trainer"). */
export const FALLBACK_TRAINER_NAME = 'your trainer';

/** Consent-history labels (`COACHING_SHARING` rows), keyed by `granted`. */
export const COACHING_CONSENT_LABELS = {
  granted: 'Trainer access allowed',
  withdrawn: 'Trainer access ended',
} as const;

export const COACHING_COPY = {
  common: {
    cancel: 'Cancel',
    retry: 'Retry',
    tryAgain: 'Try again',
    copy: 'Copy',
    copied: 'Copied',
    share: 'Share',
  },

  // ─── Client: consent screen (join) ──────────────────────────────────────────
  consent: {
    title: (trainer: string) => `${trainer} wants to coach you in Chefer.`,
    willSeeHeading: (trainer: string) => `${trainer} will see:`,
    willSee: [
      'Your active routine.',
      'Your completed workouts (exercises, sets, weights, reps, how hard the last set felt, dates) from the last 4 weeks and from now on.',
      'Which planned days you trained or missed, and when you paused training (dates only, never the reason).',
    ],
    canHeading: (trainer: string) => `${trainer} can:`,
    can: (trainer: string) => [
      'Change your routine (exercises, sets, reps, rest, notes on exercises) and set your weights and reps for the next session.',
      `You’ll see what ${trainer} changed. You can change it too.`,
    ],
    privateNotes: (trainer: string) =>
      `${trainer} can keep private notes about you. You won’t see them. Chefer never reads or uses them.`,
    neverHeading: (trainer: string) => `${trainer} will never see:`,
    never:
      'Your food, meals, body weight or measurements, nutrition targets, your notes on workouts, heart rate or calorie estimates, your age or profile.',
    oneTrainer: (trainer: string) =>
      `One trainer at a time. Leave whenever you want: ${trainer} loses access at once and your routine stays yours.`,
    switchLine: (current: string) => `You’ll stop being coached by ${current}.`,
    allow: 'Allow and join',
    switchTo: (trainer: string) => `Switch to ${trainer}`,
    notNow: 'Not now',
    needsSetup:
      'Set up your training first. It takes a minute, then you’ll come back here to join.',
    openInApp: 'Open in the Chefer app',
    continueOnWeb: 'Continue on the web',
    joinedTitle: (trainer: string) => `You’re coached by ${trainer}`,
  },

  // What the invite preview says for each state (`coaching.previewInvite`).
  inviteState: {
    OK: '',
    EXPIRED: 'This invite link has expired. Ask your trainer for a new one.',
    USED: 'This invite link was already used. Ask your trainer for a new one.',
    REVOKED: 'This invite link was cancelled. Ask your trainer for a new one.',
    NOT_FOUND: 'This invite link isn’t valid. Ask your trainer for a new one.',
    SELF: 'This is your own invite link. Send it to your client instead.',
    ALREADY_YOURS: (trainer: string) => `You’re already coached by ${trainer}.`,
  },

  // ─── Client: Your trainer ───────────────────────────────────────────────────
  yourTrainer: {
    title: 'Your trainer',
    noTrainer: 'You don’t have a trainer in Chefer.',
    noTrainerHint: 'If your trainer uses Chefer, ask them for an invite link.',
    since: (trainer: string, date: string) => `Coached by ${trainer} since ${date}`,
    stopped: (trainer: string) => `${trainer} stopped coaching you`,
    seesHeading: (trainer: string) => `What ${trainer} sees`,
    canHeading: (trainer: string) => `What ${trainer} can do`,
    leave: 'Leave',
    leaveTitle: (trainer: string) => `Leave ${trainer}?`,
    leaveBody: (trainer: string) =>
      `${trainer} loses access at once. Your routine, the notes on exercises and any pending targets stay yours.`,
    leaveConfirm: 'Leave trainer',
    left: 'You left your trainer',
  },

  // ─── Client: attribution lines in the routine, Today and the logger ─────────
  stamps: {
    routineChanged: (trainer: string, date: string) => `${trainer} changed your routine · ${date}`,
    changedBy: (name: string, date: string) => `Changed by ${name} · ${date}`,
    todayNotice: (trainer: string, date: string) => `${trainer} updated your routine · ${date}`,
    trainerNote: (trainer: string, note: string) => `${trainer}: ${note}`,
    setBy: (name: string) => `Set by ${name}`,
    removeNote: 'Remove note',
    conflict: (name: string) => `${name} changed this routine while you were editing`,
  },

  // Consent history (Profile → Privacy → Consent history).
  consentHistory: COACHING_CONSENT_LABELS,

  // ─── Trainer side ───────────────────────────────────────────────────────────
  trainer: {
    title: 'Trainer tools',
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
    inviteExpires: (date: string) => `Expires ${date}`,
    inviteStates: {
      OPEN: 'Waiting',
      USED: 'Joined',
      EXPIRED: 'Expired',
      REVOKED: 'Revoked',
    },
    revoke: 'Revoke',
    sinceClient: (date: string) => `Client since ${date}`,
    lastWorkout: (date: string) => `Last workout ${date}`,
    noWorkoutYet: 'No workout yet',
    weekProgress: (sessions: number, goal: number) => `${sessions} / ${goal} this week`,
    quiet: (days: number) => `Nothing logged for ${days} days`,
    routineChangedByClient: (name: string, date: string) => `Routine changed by ${name} · ${date}`,
    tabs: { routine: 'Routine', workouts: 'Workouts', adherence: 'Adherence', notes: 'Notes' },
    noteForClient: (client: string) => `Note for ${client}`,
    noteForClientHint: (client: string) => `${client} will see this note under the exercise.`,
    nextSession: 'Next session',
    nextDay: (day: string, weekday: string | null) =>
      weekday ? `Next: ${day} · planned ${weekday}` : `Next: ${day}`,
    appSuggestion: (value: string) => `${value} · app suggestion`,
    setByYou: (value: string, date: string) => `${value} · set by you ${date}`,
    setByClient: (value: string, date: string) => `${value} · set by the client ${date}`,
    appliesTo: (client: string, exercise: string, reps: string) =>
      `Applies the next time ${client} does ${exercise} (${reps} reps).`,
    adjust: 'Adjust',
    resetToSuggestion: 'Reset to app suggestion',
    lastDone: (date: string) => `Last done ${date}`,
    curatedOnly: 'Only Chefer’s exercises can be added to a client’s routine.',
    fillFromMine: 'Fill from one of my routines',
    privateNote: 'Private notes',
    privateNoteHint: (client: string) =>
      `Only you can see this. Chefer doesn’t read it, and ${client} never sees it.`,
    removeClient: 'Remove client',
    removeClientTitle: (client: string) => `Remove ${client}?`,
    removeClientBody: (client: string) =>
      `${client} keeps their routine and is told you stopped coaching them. Your private note is deleted after 30 days.`,
    saveConflict: (client: string) => `${client} changed this routine while you were editing`,
    // The invite as a QR code, for in-person sign-ups (PRD 2026-10 §4.1, S5).
    qr: {
      show: 'Show QR code',
      title: 'Scan to join',
      hint: 'Your client points their phone camera at this code to open the invite.',
      label: 'QR code of the invite',
    },
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
  },
  request: {
    ask: 'Ask to coach me',
    askTitle: (trainer: string) => `Ask ${trainer} to coach you?`,
    sendConsent: 'Allow and send request',
    sent: (trainer: string) => `Request sent to ${trainer}`,
    pending: (trainer: string) => `Waiting for ${trainer} to answer`,
    expires: (date: string) => `Expires ${date}`,
    cancel: 'Cancel request',
    cancelled: 'Request cancelled',
    switchNote: (current: string, trainer: string) =>
      `This ends your coaching with ${current} when ${trainer} accepts.`,
    otherPending: (trainer: string) => `You already asked ${trainer}. Cancel that request first.`,
    yourTrainer: (trainer: string) => `${trainer} is your trainer.`,
    noFollow: 'Asking doesn’t follow them or make your profile public.',
    // Trainer side
    listTitle: 'Requests',
    fromClient: (client: string) => `${client} asked you to coach them`,
    hasTrainer: 'Has a trainer now: accepting ends that coaching.',
    accept: 'Accept',
    decline: 'Decline',
    accepted: (client: string) => `You now coach ${client}`,
    declined: 'Request declined',
  },

  // ─── Coaching notices (PRD 2026-10 §4.2, §4.3) ──────────────────────────────
  notices: {
    routineUpdated: (name: string) => `${name} updated your routine`,
    clientUpdated: (client: string) => `${client} changed their routine`,
    requestReceived: (client: string) => `${client} asked you to coach them`,
    requestAccepted: (trainer: string) => `${trainer} is now your trainer`,
    requestDeclined: (trainer: string) => `${trainer} can’t take you on right now`,
    endedByTrainer: (trainer: string) =>
      `${trainer} stopped coaching you. Your routine stays yours.`,
    endedByClient: (client: string) => `${client} left. Their routine stays theirs.`,
    trainerGone: 'Your trainer stopped using Chefer. Your routine stays yours.',
    view: 'View',
    dismiss: 'Dismiss',
  },

  // ─── Trainer stops / profile (PRD 2026-10 §4.1, §4.3) ───────────────────────
  trainerProfile: {
    gymLine: 'Gym / city (optional)',
    gymLineHint: 'Shown under your name, for example “Iron Gym, Cluj”.',
    findableNote:
      'Turning this on also turns on a private Following profile, so clients can find you by name. Your plan and workouts stay hidden.',
    turnOffWithClients: (n: number) =>
      n === 1
        ? 'Your 1 client loses you as their trainer at once and keeps their routine.'
        : `Your ${n} clients lose you as their trainer at once and keep their routines.`,
    endCoaching: 'End coaching',
    keepItSimple: 'Keep it simple',
    keepItSimpleHint: (client: string) =>
      `${client} chose “Keep it simple”: they tick exercises off instead of logging weights. Only ${client} can change this.`,
    doneAsPlanned: 'Done as planned',
    feedback: 'Send feedback',
  },

  // ─── Server messages (BAD_REQUEST etc. shown as is by older clients) ────────
  server: {
    clientUnavailable: 'This client isn’t available',
    notFound: 'Not found',
    trainerToolsOff: 'Turn on trainer tools first.',
    notAllowed: 'Trainer tools aren’t available for your account yet.',
    nameRejected: 'Choose a different name.',
    openInviteLimit: 'You have too many open invites. Revoke one first.',
    clientLimit: 'You’ve reached the number of clients Chefer supports for now.',
    inviteNotValid: 'This invite link isn’t valid.',
    needsGymSetup: 'Set up your training first, then join.',
    selfCoaching: 'You can’t coach yourself.',
    customExerciseNotAllowed: 'Only Chefer’s exercises can be added to a client’s routine.',
    clientHasRoutine: 'This client already has an active routine.',
    noActiveRoutine: 'This client has no active routine yet.',
    routineSwitched: 'The client switched to a different routine. Reload to see it.',
    exerciseNotInRoutine: 'That exercise isn’t in the client’s active routine.',
    tooManyAttempts: 'Too many attempts. Please wait a while and try again.',
    trainerUnavailable: 'This trainer isn’t available',
    requestUnavailable: 'This request isn’t available',
    notTakingClients: 'This trainer isn’t taking new clients.',
    alreadyYourTrainer: 'This is already your trainer.',
    requestPendingElsewhere: 'You already have a pending request. Cancel it first.',
  },
} as const;

/**
 * Who an edit stamp names: "Ana", "Ana (former trainer)", or "a former trainer"
 * when the account is gone. Used by "Changed by …" and "Set by …".
 */
export function editorLabel(stamp: { name: string; former?: boolean | undefined }): string {
  if (!stamp.former) return stamp.name;
  if (stamp.name === FALLBACK_TRAINER_NAME || stamp.name.trim() === '') return 'a former trainer';
  return `${stamp.name} (former trainer)`;
}

/** "3×8" / "3×8–10": a routine row's sets and reps in a change line. */
export function setsRepsLabel(sets: number, repMin: number, repMax: number): string {
  return repMin === repMax ? `${sets}×${repMin}` : `${sets}×${repMin}–${repMax}`;
}

/** One change in plain words: "+ Romanian deadlift", "Squat 3×8 → 4×6", "note on Bench press". */
export function routineChangeText(change: RoutineChange): string {
  switch (change.kind) {
    case 'added':
      return `+ ${change.exercise}`;
    case 'removed':
      return `− ${change.exercise}`;
    case 'changed':
      return `${change.exercise} ${change.from} → ${change.to}`;
    case 'note':
      return `note on ${change.exercise}`;
    case 'schedule':
      return 'days changed';
    case 'created':
      return 'new routine';
  }
}

/** The whole card line: "+ Romanian deadlift · Squat 3×8 → 4×6 · note on Bench press · + 2 more". */
export function routineChangesLine(changes: readonly RoutineChange[], max = 4): string {
  const shown = changes.slice(0, max).map(routineChangeText);
  const more = changes.length - shown.length;
  return [...shown, ...(more > 0 ? [`+ ${more} more`] : [])].join(' · ');
}

/** The trainer's display name for a client-facing line, or the fallback when it is gone. */
export function trainerNameOrFallback(name: string | null | undefined): string {
  return name && name.trim() !== '' ? name : FALLBACK_TRAINER_NAME;
}
