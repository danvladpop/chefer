// Platform-free clients for the API's raw-body image endpoints (M3-2 scan,
// M3-3 uploads). Same injectable-fetch pattern as chat-stream.ts: the app
// passes expo/fetch, the contract tests pass Node's fetch. Bodies are raw
// bytes with the image's content-type — no multipart (mirrors web's
// scan-client.ts / upload-image.ts transport).

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

export interface MediaClientOptions {
  fetchImpl: typeof fetch;
  apiBaseUrl: string;
  getToken: () => string | null;
}

export interface MealPhotoEstimate {
  dishName: string;
  confidence: 'low' | 'med' | 'high';
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  portionNote: string;
}

export class ScanUpgradeRequiredError extends Error {}

/** Decodes base64 (as returned by expo-image-picker) into bytes. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function authHeaders(getToken: () => string | null, mime: string): Record<string, string> {
  const token = getToken();
  return {
    'content-type': mime,
    'x-chefer-client': 'mobile',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Sends one meal photo to /api/scan-meal for the F4 vision estimate. Throws
 * ScanUpgradeRequiredError on the premium gate (403 + upgradeRequired).
 */
export async function scanMealPhoto(
  { fetchImpl, apiBaseUrl, getToken }: MediaClientOptions,
  bytes: Uint8Array,
  mime: ImageMime,
): Promise<MealPhotoEstimate> {
  const res = await fetchImpl(`${apiBaseUrl}/api/scan-meal`, {
    method: 'POST',
    headers: authHeaders(getToken, mime),
    body: bytes as unknown as BodyInit,
  });
  const data = (await res.json().catch(() => null)) as {
    estimate?: MealPhotoEstimate;
    error?: string;
    upgradeRequired?: boolean;
  } | null;

  if (res.status === 403 && data?.upgradeRequired) {
    throw new ScanUpgradeRequiredError(data.error ?? 'Photo scanning is a premium feature.');
  }
  if (!res.ok || !data?.estimate) {
    throw new Error(data?.error ?? `Scan failed (${res.status})`);
  }
  return data.estimate;
}

/** Uploads an image to /api/uploads/image; returns its public URL. */
export async function uploadImage(
  { fetchImpl, apiBaseUrl, getToken }: MediaClientOptions,
  bytes: Uint8Array,
  mime: Exclude<ImageMime, 'image/heic'>,
): Promise<string> {
  const res = await fetchImpl(`${apiBaseUrl}/api/uploads/image`, {
    method: 'POST',
    headers: authHeaders(getToken, mime),
    body: bytes as unknown as BodyInit,
  });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error ?? `Upload failed (${res.status})`);
  }
  return data.url;
}
