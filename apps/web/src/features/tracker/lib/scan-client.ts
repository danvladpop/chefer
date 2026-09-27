// ─── /api/scan-meal client (F4 Snap-to-Log) ───────────────────────────────────
// Same raw-body transport as lib/upload-image.ts: the file's bytes go up with
// their image/* content-type, session cookie included.

const API_URL = process.env['NEXT_PUBLIC_API_URL'];
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

// Scan's server-side limit is unchanged by T-BUG-O1 (uploads went to 10 MB,
// scan stays 5 MB) — apps/api/src/routers/scan.router.ts.
const MAX_BYTES = 5 * 1024 * 1024;

// UX-40's four photo-failure sentences (03-ux-design-spec.md lines
// 4460-4485, UX-21 amendment A1) — never a status code, never
// `[object Object]`. Duplicated from apps/mobile/src/lib/media-client.ts and
// apps/web/src/lib/upload-image.ts: apps cannot import each other's app
// code, and this is UI copy, not shared business logic.
const PHOTO_TOO_BIG_MESSAGE = 'That photo is too big. Choose another, or use a screenshot of it.';
const NO_CONNECTION_MESSAGE = 'No connection. Try again when you’re back online.';
const SIGNED_OUT_MESSAGE = 'Sign in again to add photos.';
const SOMETHING_WRONG_MESSAGE = 'Something went wrong on our side. Try again in a moment.';

type ApiErrorBody = {
  error?: string | { code?: string; message?: string };
  upgradeRequired?: boolean;
} | null;

/**
 * Maps a failed scan to one of the four user-facing sentences (T-BUG-O1).
 * Reads both error shapes the API can answer with, without ever putting the
 * field's raw content into the thrown Error (that is what used to render as
 * "[object Object]"). The premium-gate (403 + upgradeRequired) case is
 * handled separately by the caller before this runs.
 */
function scanErrorFrom(status: number | null, body: unknown): Error {
  const errorField = (body as ApiErrorBody)?.error;
  const code = typeof errorField === 'object' ? errorField.code : undefined;

  if (status === 413 || code === 'entity.too.large') {
    return new Error(PHOTO_TOO_BIG_MESSAGE);
  }
  if (status === 401) {
    return new Error(SIGNED_OUT_MESSAGE);
  }
  if (status === null) {
    return new Error(NO_CONNECTION_MESSAGE);
  }
  return new Error(SOMETHING_WRONG_MESSAGE);
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

/**
 * Sends one meal photo for analysis. Throws ScanUpgradeRequiredError on the
 * premium gate (403) so the caller can open the upgrade surface instead of
 * showing a generic failure.
 */
export async function scanMealPhoto(file: File): Promise<MealPhotoEstimate> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(PHOTO_TOO_BIG_MESSAGE);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/scan-meal`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': file.type },
      body: file,
    });
  } catch {
    throw scanErrorFrom(null, null);
  }

  const data = (await res.json().catch(() => null)) as {
    estimate?: MealPhotoEstimate;
    error?: string | { code?: string; message?: string };
    upgradeRequired?: boolean;
  } | null;

  if (res.status === 403 && data?.upgradeRequired) {
    const message = typeof data.error === 'string' ? data.error : undefined;
    throw new ScanUpgradeRequiredError(message ?? 'Photo scanning is a premium feature.');
  }
  if (!res.ok || !data?.estimate) {
    throw scanErrorFrom(res.status, data);
  }
  return data.estimate;
}
