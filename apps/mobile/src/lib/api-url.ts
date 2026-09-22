import { Platform } from 'react-native';
import { env } from './env';

/**
 * Base URL of the API for the current platform.
 *
 * The Android emulator cannot reach the host's `localhost` — Google maps the
 * host loopback to 10.0.2.2 inside the emulator. The iOS simulator shares the
 * host network, so plain localhost works. Physical devices reach neither and
 * must set EXPO_PUBLIC_API_URL to the host's LAN address.
 */
export function getApiBaseUrl(): string {
  if (env.EXPO_PUBLIC_API_URL) {
    return env.EXPO_PUBLIC_API_URL;
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
}

export function getTrpcUrl(): string {
  return `${getApiBaseUrl()}/trpc`;
}
