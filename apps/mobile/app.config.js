// Expo config as plain JS: eas-cli's TS loader failed to parse the .ts
// version ("Unexpected token '{'", eas-cli 23.1.0) while expo itself read it
// fine — plain JS removes the loader variance. Typed via the JSDoc below.

/**
 * Bundle identifier dev.chefer.app was confirmed at EAS setup (M4-1).
 * @type {import('expo/config').ExpoConfig}
 */
const config = {
  name: 'Chefer',
  slug: 'chefer',
  owner: 'cheferoni',
  scheme: 'chefer',
  version: '0.0.1',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'dev.chefer.app',
    supportsTablet: false,
  },
  android: {
    package: 'dev.chefer.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
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
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: 'f4d9a056-7f4d-4ee4-b185-2f0bcea37225',
    },
  },
};

module.exports = config;
