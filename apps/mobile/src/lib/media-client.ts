// Platform-free clients for the API's raw-body image endpoints (M3-2 scan,
// M3-3 uploads). Same injectable-fetch pattern as chat-stream.ts: the app
// passes expo/fetch, the contract tests pass Node's fetch. Bodies are raw
// bytes with the image's content-type — no multipart (mirrors web's
// scan-client.ts / upload-image.ts transport).

import { AI_CONSENT_REQUIRED_REASON } from '@chefer/types';
import { notifyAiConsentRequired } from '@chefer/utils';

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

// Keep in sync with the server-side limits: apps/api/src/routers/uploads.router.ts
// (MAX_BYTES) and apps/api/src/routers/scan.router.ts (MAX_BYTES). T-BUG-O1
// (O-18, Q-22) raised uploads to 10 MB; scan stays 5 MB.
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const SCAN_MAX_BYTES = 5 * 1024 * 1024;

// UX-40's four photo-failure sentences (03-ux-design-spec.md lines 4460-4485,
// UX-21 amendment A1) — never a status code, never `[object Object]`.
export const PHOTO_TOO_BIG_MESSAGE =
  'That photo is too big. Choose another, or use a screenshot of it.';
const NO_CONNECTION_MESSAGE = 'No connection. Try again when you’re back online.';
const SIGNED_OUT_MESSAGE = 'Sign in again to add photos.';
export const SOMETHING_WRONG_MESSAGE = 'Something went wrong on our side. Try again in a moment.';

type ApiErrorBody = { error?: string | { code?: string; message?: string } } | null | undefined;

/**
 * Maps a failed upload/scan attempt to exactly one of UX-40's four
 * user-facing sentences (T-BUG-O1, O-18). The Express global handler answers
 * `{ error: { code, message } }` (apps/api/src/index.ts L204-211); the
 * uploads/scan routers answer their own explicit errors as `{ error: string
 * }`. Reading both shapes here — without ever putting the field's content
 * into the returned Error — is what stops `new Error(data.error)` from
 * producing the literal string "[object Object]" when the object shape comes
 * back.
 *
 * `status` is `null` for a network failure (the fetch itself rejected, no
 * response at all). `bytes` is the request body size: it lets a body over
 * the shared upper bound still map to the too-big sentence even if the
 * connection dropped before a clean 413 came back, instead of being
 * mis-read as "no connection".
 */
export function uploadErrorFrom(status: number | null, body: unknown, bytes: number): Error {
  const errorField = (body as ApiErrorBody)?.error;
  const code = typeof errorField === 'object' ? errorField.code : undefined;

  if (status === 413 || code === 'entity.too.large' || bytes > UPLOAD_MAX_BYTES) {
    return new Error(PHOTO_TOO_BIG_MESSAGE);
  }
  if (status === 401) {
    return new Error(SIGNED_OUT_MESSAGE);
  }
  if (status === null) {
    return new Error(NO_CONNECTION_MESSAGE);
  }
  // A string `error` from the route's own checks is already copy written for
  // users (daily upload cap, scan quota, AI outage, unreadable photo) — keep it. 400/415 are transport checks worded for
  // developers, and the global handler's object shape never gets here.
  if (typeof errorField === 'string' && errorField && status !== 400 && status !== 415) {
    return new Error(errorField);
  }
  return new Error(SOMETHING_WRONG_MESSAGE);
}

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
  if (bytes.length > SCAN_MAX_BYTES) {
    throw new Error(PHOTO_TOO_BIG_MESSAGE);
  }

  let res: Response;
  try {
    res = await fetchImpl(`${apiBaseUrl}/api/scan-meal`, {
      method: 'POST',
      headers: authHeaders(getToken, mime),
      body: bytes as unknown as BodyInit,
    });
  } catch {
    throw uploadErrorFrom(null, null, bytes.length);
  }

  const data = (await res.json().catch(() => null)) as {
    estimate?: MealPhotoEstimate;
    error?: string | { code?: string; message?: string };
    upgradeRequired?: boolean;
    reason?: string;
  } | null;

  if (res.status === 403 && data?.upgradeRequired) {
    const message = typeof data.error === 'string' ? data.error : undefined;
    throw new ScanUpgradeRequiredError(message ?? 'Photo scanning is a premium feature.');
  }
  // R-10: the server has no AI consent on record — reopen the sheet (the
  // thrown message, the same sentence, still shows in the card).
  if (res.status === 403 && data?.reason === AI_CONSENT_REQUIRED_REASON) {
    notifyAiConsentRequired('meal-scan');
  }
  if (!res.ok || !data?.estimate) {
    throw uploadErrorFrom(res.status, data, bytes.length);
  }
  return data.estimate;
}

/** Uploads an image to /api/uploads/image; returns its public URL. */
export async function uploadImage(
  { fetchImpl, apiBaseUrl, getToken }: MediaClientOptions,
  bytes: Uint8Array,
  mime: Exclude<ImageMime, 'image/heic'>,
): Promise<string> {
  if (bytes.length > UPLOAD_MAX_BYTES) {
    throw new Error(PHOTO_TOO_BIG_MESSAGE);
  }

  let res: Response;
  try {
    res = await fetchImpl(`${apiBaseUrl}/api/uploads/image`, {
      method: 'POST',
      headers: authHeaders(getToken, mime),
      body: bytes as unknown as BodyInit,
    });
  } catch {
    throw uploadErrorFrom(null, null, bytes.length);
  }

  const data = (await res.json().catch(() => null)) as {
    url?: string;
    error?: string | { code?: string; message?: string };
  } | null;
  if (!res.ok || !data?.url) {
    throw uploadErrorFrom(res.status, data, bytes.length);
  }
  return data.url;
}
