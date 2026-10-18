// ─── /.well-known association files (WP-22) ──────────────────────────────────
// Lets iOS (webcredentials) and Android (get_login_creds) password managers
// offer "suggest a strong password" and autofill saved logins in the native
// app for chefer's domain, and opens coaching invite links in the app instead
// of the browser (iOS universal links `applinks`, Android App Links
// `handle_all_urls`). Served by the API (Caddy routes the two paths here)
// because the Android fingerprints come from API env.

/** The Apple Developer Team that owns the iOS app (also the Sign in with Apple team). */
export const APPLE_APP_TEAM_ID = '45TS85YK89';
export const IOS_BUNDLE_ID = 'com.popdan.chefer';
/** Production Android application id (apps/mobile/app.config.js). */
export const ANDROID_PACKAGE_NAME = 'dev.chefer.app';

/**
 * The web paths the app opens instead of the browser. Only coaching invites:
 * every other page stays in the browser. The app's Android intent filter
 * (apps/mobile/app.config.js) must claim the same prefix.
 */
export const APP_LINK_PATH_PREFIX = '/coaching/join/';

export type AppleAppSiteAssociation = {
  applinks: {
    details: { appIDs: string[]; components: { '/': string; comment: string }[] }[];
  };
  webcredentials: { apps: string[] };
};

export function buildAppleAppSiteAssociation(
  teamId: string = APPLE_APP_TEAM_ID,
  bundleId: string = IOS_BUNDLE_ID,
): AppleAppSiteAssociation {
  const appId = `${teamId}.${bundleId}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appId],
          components: [{ '/': `${APP_LINK_PATH_PREFIX}*`, comment: 'Coaching invite links' }],
        },
      ],
    },
    webcredentials: { apps: [appId] },
  };
}

export type AssetLinkStatement = {
  relation: string[];
  target: { namespace: 'android_app'; package_name: string; sha256_cert_fingerprints: string[] };
};

/** An empty list when no fingerprint is configured (a valid, harmless file). */
export function buildAssetLinks(
  fingerprints: readonly string[],
  packageName: string = ANDROID_PACKAGE_NAME,
): AssetLinkStatement[] {
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds',
      ],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: [...fingerprints],
      },
    },
  ];
}
