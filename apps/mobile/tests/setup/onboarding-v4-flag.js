// Onboarding V4 is behind the `onboardingV4` flag, read through
// useOnboardingV4Flag(). Existing screen tests (Welcome, Register,
// /onboarding) exercise today's flow, so the flag reads as off unless a test
// mocks the hook itself (tests/unit/onboarding-v4*.test.tsx render the V4
// components directly).
jest.mock('../../src/features/onboarding-v4/use-onboarding-v4-flag', () => ({
  useOnboardingV4Flag: () => 'off',
}));
