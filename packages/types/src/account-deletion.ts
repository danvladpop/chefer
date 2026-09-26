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
    'Your own and imported recipes, favourites and ratings',
    'Workouts, routines and custom exercises',
    'Household members, feedback, and your sign-in on every device',
  ],
  backups: 'Backup copies age out within 14 days.',
  passwordLabel: 'Your password',
  confirmLabel: 'Type DELETE to confirm',
  confirmWord: 'DELETE',
  submit: 'Delete my account',
  submitting: 'Deleting…',
  cancel: 'Cancel',
} as const;
