// Auth copy (technical-plan.md §2.10 / T-00.6). Every user-facing string in
// the sign-in/sign-up feature lives here instead of inline in JSX. Scanned by
// the `chefer/no-forbidden-copy` ESLint rule (base.js).
//
// UX-25 (T-25.1): the Welcome screen and the login/register copy that changes
// with it. The row-2 Welcome bullet ("only what works on the free tier" rule,
// 03 §UX-25) stays the pre-UX-06/UX-07 line — bump it in the same PR as those
// features, not before.

export type AuthCopyKey =
  | 'welcomeTitle'
  | 'welcomeSubtitle'
  | 'welcomeFeatureWorkouts'
  | 'welcomeFeatureMeals'
  | 'welcomeFeatureSafety'
  | 'welcomeCreateAccount'
  | 'welcomeHaveAccount'
  | 'welcomeLegalFooter'
  | 'loginTitleReturning'
  | 'loginTitleFirstTime'
  | 'loginSubtitleReturning'
  | 'loginSubtitleFirstTime'
  | 'loginCreateAccountCta'
  | 'registerSubtitle'
  | 'registerTermsLabel'
  | 'registerAgeLabel'
  | 'registerTermsError'
  | 'registerAgeError'
  | 'socialDivider'
  | 'socialGoogle'
  | 'socialConsentLead'
  | 'socialConsentTail'
  | 'socialSdkError'
  | 'socialNoSession';

export const AUTH_COPY: Record<AuthCopyKey, string> = {
  welcomeTitle: 'Train and eat to one plan',
  welcomeSubtitle:
    'A free workout log that tells you what to lift next, and a week of meals with one shopping list.',
  welcomeFeatureWorkouts: 'Workouts that tell you what to lift next — free',
  welcomeFeatureMeals: 'A week of meals and one shopping list',
  welcomeFeatureSafety: 'Allergies checked on every plan',
  welcomeCreateAccount: 'Create free account',
  welcomeHaveAccount: 'I already have an account',
  welcomeLegalFooter: 'By continuing you agree to the',
  loginTitleReturning: 'Welcome back',
  loginTitleFirstTime: 'Sign in',
  loginSubtitleReturning: 'Sign in to your Chefer account',
  loginSubtitleFirstTime: 'Use the email you signed up with.',
  loginCreateAccountCta: 'Create free account',
  registerSubtitle: 'Free workout log and weekly meal plans.',
  registerTermsLabel: 'I agree to the',
  registerAgeLabel: 'I’m 16 or older',
  registerTermsError: 'You must agree to the Terms and the Privacy Policy',
  registerAgeError: 'You must confirm you are 16 or older',
  // WP-22: Continue with Apple / Google. The consent line is the same wording
  // the API records as TERMS + PRIVACY + AGE consent (acceptLegal).
  socialDivider: 'or',
  socialGoogle: 'Continue with Google',
  socialConsentLead: 'By continuing you agree to the',
  socialConsentTail: 'and confirm you are 16 or older.',
  socialSdkError: 'We couldn’t finish signing in. Please try again.',
  socialNoSession: 'We couldn’t start your session. Please try again.',
};
