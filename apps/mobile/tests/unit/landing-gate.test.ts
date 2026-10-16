import {
  claimLanding,
  markLandingDecided,
  resetLandingGateForTests,
} from '../../src/features/navigation/landing-gate';

// The cold-start landing runs once per sign-in; onboarding can claim it.

beforeEach(() => resetLandingGateForTests());

describe('landing gate', () => {
  it('a sign-in gets its landing once', () => {
    expect(claimLanding('t1')).toBe(true);
    expect(claimLanding('t1')).toBe(false);
    expect(claimLanding('t2')).toBe(true);
  });

  it('finishing onboarding decides the landing for that sign-in only', () => {
    markLandingDecided('t1');
    expect(claimLanding('t1')).toBe(false);
    expect(claimLanding('t2')).toBe(true);
  });
});
