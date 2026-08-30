import type { ExpoConfig } from 'expo/config';

// Bundle identifiers are placeholders until the store release (plan task M4-1)
// confirms the final ids with the user.
const config: ExpoConfig = {
  name: 'Chefer',
  slug: 'chefer',
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
  plugins: ['expo-router', 'expo-secure-store', 'expo-dev-client'],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
