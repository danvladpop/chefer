// Expo config as plain JS: eas-cli's TS loader failed to parse the .ts
// version ("Unexpected token '{'", eas-cli 23.1.0) while expo itself read it
// fine — plain JS removes the loader variance. Typed via the JSDoc below.

const EAS_PROJECT_ID = 'f4d9a056-7f4d-4ee4-b185-2f0bcea37225';

// Two app variants (M4-4) so a laptop-independent production build and a
// Metro-backed dev client can live side by side on the same phone:
//   production  — "Chefer",     dev.chefer.app,     EAS Update channel "production"
//   development — "Chefer Dev", dev.chefer.app.dev, dev client (default)
// ios/ and android/ are generated per variant — scripts/ensure-variant.sh
// re-runs prebuild when the variant changes.
const APP_VARIANT = process.env.APP_VARIANT ?? 'development';
if (APP_VARIANT !== 'development' && APP_VARIANT !== 'production') {
  throw new Error(`APP_VARIANT must be "development" or "production", got "${APP_VARIANT}"`);
}
const IS_PRODUCTION = APP_VARIANT === 'production';

// A production binary or OTA update bundled without the prod API URL would
// fall back to localhost and brick every installed app — refuse to build it.
if (IS_PRODUCTION && !process.env.EXPO_PUBLIC_API_URL?.startsWith('https://')) {
  throw new Error(
    'APP_VARIANT=production requires EXPO_PUBLIC_API_URL=https://… (use the scripts in apps/mobile/scripts/)',
  );
}

/**
 * Bundle identifier dev.chefer.app was confirmed at EAS setup (M4-1); the dev
 * variant appends ".dev".
 * @type {import('expo/config').ExpoConfig}
 */
const config = {
  name: IS_PRODUCTION ? 'Chefer' : 'Chefer Dev',
  slug: 'chefer',
  owner: 'cheferoni',
  scheme: IS_PRODUCTION ? 'chefer' : 'chefer-dev',
  version: '0.0.1',
  // Explicit, not auto-detected: "web" is added only when react-native-web
  // resolves, which differs between pnpm's `expo` shim (NODE_PATH) and the
  // bare node calls in Gradle/Xcode — that flipped the runtime fingerprint
  // between build and `eas update`, silently blocking OTA delivery.
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  // Plate-and-cutlery on brand brown; the dev variant carries a DEV band so the
  // two installs are distinguishable. Sources: assets/icon-source/*.svg.
  icon: IS_PRODUCTION ? './assets/icon.png' : './assets/icon-dev.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: IS_PRODUCTION ? 'dev.chefer.app' : 'dev.chefer.app.dev',
    supportsTablet: false,
    // Apple team for signing local device builds (set in .env — the repo is
    // public). Unset is fine: simulator builds don't sign, and EAS cloud
    // builds bring their own credentials.
    ...(process.env.EXPO_APPLE_TEAM_ID ? { appleTeamId: process.env.EXPO_APPLE_TEAM_ID } : {}),
  },
  android: {
    package: IS_PRODUCTION ? 'dev.chefer.app' : 'dev.chefer.app.dev',
    adaptiveIcon: {
      backgroundColor: '#944a00',
      foregroundImage: IS_PRODUCTION
        ? './assets/android-icon-foreground.png'
        : './assets/android-icon-foreground-dev.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-dev-client',
    [
      'expo-image-picker',
      {
        photosPermission: 'Chefer uses your photos to scan meals and illustrate your recipes.',
        cameraPermission: 'Chefer uses the camera to scan meals you are about to eat.',
      },
    ],
    // Gym (gym_plan.md §5.6): offline store, cached exercise photos, local
    // reminders + rest-timer notifications. One native batch, one rebuild.
    'expo-sqlite',
    'expo-image',
    ['expo-notifications', { color: '#944a00' }],
  ],
  // OTA updates via EAS Update. The fingerprint policy hashes the native
  // layer, so an update only reaches binaries with identical native code —
  // adding a native module yields a new runtime and requires a rebuild.
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    // Local builds don't get the channel from eas.json — embed it here.
    requestHeaders: { 'expo-channel-name': IS_PRODUCTION ? 'production' : 'development' },
  },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appVariant: APP_VARIANT,
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
};

module.exports = config;
