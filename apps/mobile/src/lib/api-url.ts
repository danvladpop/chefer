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

/**
 * A page on the Chefer website (terms, privacy). Prod serves web and API on
 * one origin; in development the web app runs on :3000 next to the API.
 */
export function getWebUrl(path: string): string {
  const url = new URL(getApiBaseUrl());
  if (url.port === '3001') url.port = '3000';
  return `${url.origin}${path}`;
}
