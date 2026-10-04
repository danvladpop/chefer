// Mobile-only strings of the coaching client flow that have no shared `COACHING_COPY` entry. They are
// the same words the web client flow uses (apps/web/src/features/coaching/components/*): keep them equal.

export const COACHING_MOBILE_COPY = {
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
} as const;
