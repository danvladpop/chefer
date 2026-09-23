import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { formatBuildInfo } from './build-info';

/** The running build, e.g. "Chefer 0.0.1 · production · update 3f2a9c1e". */
export const CURRENT_BUILD = formatBuildInfo({
  appVersion: Constants.expoConfig?.version,
  variant: Constants.expoConfig?.extra?.appVariant as string | undefined,
  updatesEnabled: Updates.isEnabled,
  isDevServer: __DEV__,
  channel: Updates.channel,
  updateId: Updates.updateId,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
});
