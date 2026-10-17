// ─── Self-serve account deletion copy (App Store 5.1.1(v)) ───────────────────
// Shared by the web Profile sheet and the mobile Profile sheet so both state
// the same thing: it is permanent, and exactly what goes.

export const ACCOUNT_DELETION_COPY = {
  button: 'Delete account',
  title: 'Delete your account?',
  permanent: 'This permanently deletes your Chefer account. It can’t be undone.',
  listHeading: 'Deleted for good:',
  deleted: [
    'Your profile, preferences, allergies, goals and body metrics',
    'Meal plans, shopping lists, food logs, weight entries and pantry',
    'Your own and imported recipes, uploaded photos, favourites and ratings',
    'Workouts, routines and custom exercises',
    'Household members, feedback, and your sign-in on every device',
  ],
  backups: 'Backup copies age out within about 30 days.',
  passwordLabel: 'Your password',
  forgotPassword: 'Forgot your password?',
  resetSending: 'Sending…',
  resetSentTo: 'We sent a reset link to',
  resetSentHint: 'It expires in one hour. Reset your password, then come back to delete.',
  // WP-22: accounts that sign in with Google/Apple only have no password to
  // type — they confirm with a fresh sign-in from that provider instead.
  reauthTitle: 'Confirm it’s you',
  reauthHint: 'Sign in with the account you use for Chefer, and your account will be deleted.',
  reauthTypeFirst: 'Type DELETE below first.',
  reauthApple: 'Confirm with Apple and delete',
  reauthGoogle: 'Confirm with Google and delete',
  reauthUnavailable:
    'This browser can’t confirm with your connected account. Use the Chefer app, or set a password with a reset email below, then come back.',
  confirmLabel: 'Type DELETE to confirm',
  confirmWord: 'DELETE',
  submit: 'Delete my account',
  submitting: 'Deleting…',
  cancel: 'Cancel',
} as const;
