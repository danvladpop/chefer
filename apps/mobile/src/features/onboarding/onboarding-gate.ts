// UX-ONB-01: has the onboarding wizard already been dealt with in THIS launch,
// for THIS sign-in? The Food layout redirects an unfinished account into the
// wizard once per sign-in per launch — never again after the wizard has been
// shown (the user may have chosen "Leave setup", and a redirect that fires
// every render would trap them in it). Keyed by the session token like the
// layout's landing check, in memory only: a cold start asks again, which is
// exactly how an interrupted setup is resumed.

let handledForToken: string | null = null;

/** The wizard is on screen (or was redirected to) for this sign-in. */
export function markOnboardingGateHandled(token: string | null): void {
  handledForToken = token;
}

export function isOnboardingGateHandled(token: string | null): boolean {
  return token !== null && handledForToken === token;
}

/** Sign-out: the next sign-in starts unhandled. */
export function resetOnboardingGate(): void {
  handledForToken = null;
}
