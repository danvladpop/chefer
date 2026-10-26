// ─── App store links ──────────────────────────────────────────────────────────
// Where the native apps live, and the campaign-tagged links the web uses to
// send people there (ASO plan §5.2–5.3). The mobile app has no attribution SDK,
// so the store consoles' own campaign reports are how web installs are
// measured: Play Console reads the `referrer` UTM tags, App Store Connect App
// Analytics reads `ct` (only when `pt` is present too).

/** Android package — live on Google Play since 1.0.1. */
export const PLAY_STORE_PACKAGE = 'dev.chefer.app';

/**
 * Numeric Apple ID from App Store Connect → App Information. OWNER STEP: set
 * it once iOS is approved and live; until then every App Store badge, link and
 * the Safari Smart App Banner stay hidden.
 */
export const APP_STORE_APP_ID: string | null = null;

/**
 * App Store Connect provider token (`pt`, App Analytics → Campaigns → Generate
 * a campaign link). OWNER STEP: without it Apple ignores `ct` and web installs
 * show as "Web referrer" with no campaign breakdown.
 */
export const APP_STORE_PROVIDER_TOKEN: string | null = null;

/** Where a store link sits; becomes the campaign in both store consoles. */
export type StoreCampaign =
  | 'landing-hero'
  | 'landing-footer'
  | 'support'
  | 'coaching-invite'
  | 'switch-mealime'
  | 'share-card'
  | 'household-invite';

const PLAY_UTM_SOURCE = 'chefer-web';
const PLAY_UTM_MEDIUM = 'badge';

/** Google Play listing, untagged unless a campaign is given. */
export function playStoreUrl(campaign?: StoreCampaign): string {
  const url = new URL('https://play.google.com/store/apps/details');
  url.searchParams.set('id', PLAY_STORE_PACKAGE);
  if (campaign) {
    // Play wants the UTM tags as one url-encoded `referrer` value.
    const referrer = new URLSearchParams({
      utm_source: PLAY_UTM_SOURCE,
      utm_medium: PLAY_UTM_MEDIUM,
      utm_campaign: campaign,
    }).toString();
    url.searchParams.set('referrer', referrer);
  }
  return url.toString();
}

type AppStoreIds = { appId?: string | null; providerToken?: string | null };

/**
 * App Store listing, or null while the app has no Apple ID. The ids default to
 * the constants above; tests pass their own.
 */
export function appStoreUrl(
  campaign?: StoreCampaign,
  { appId = APP_STORE_APP_ID, providerToken = APP_STORE_PROVIDER_TOKEN }: AppStoreIds = {},
): string | null {
  if (!appId) return null;
  const url = new URL(`https://apps.apple.com/app/id${appId}`);
  if (campaign) {
    if (providerToken) url.searchParams.set('pt', providerToken);
    url.searchParams.set('ct', campaign);
  }
  return url.toString();
}
