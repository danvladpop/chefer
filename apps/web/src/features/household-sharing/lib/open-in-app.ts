// The production app's custom-scheme link to a household invite
// (apps/mobile household/join/[code]). The phone check is the coaching one.

export function appHouseholdJoinUrl(code: string): string {
  return `chefer://household/join/${encodeURIComponent(code)}`;
}
