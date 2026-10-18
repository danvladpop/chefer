// "Open in the Chefer app" for an invite link opened in a phone's browser.

// Devices the Chefer app runs on, by user agent. iPadOS Safari reports a Mac
// user agent and gets the web flow, which is fine: the app is iPhone-only.
const MOBILE_UA = /Android|iPhone|iPad|iPod/i;

export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  return typeof userAgent === 'string' && MOBILE_UA.test(userAgent);
}

/** The production app's custom-scheme link to the same invite (apps/mobile/app/coaching/join/[code].tsx). */
export function appJoinUrl(code: string): string {
  return `chefer://coaching/join/${encodeURIComponent(code)}`;
}
