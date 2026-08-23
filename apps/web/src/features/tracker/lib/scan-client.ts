// ─── /api/scan-meal client (F4 Snap-to-Log) ───────────────────────────────────
// Same raw-body transport as lib/upload-image.ts: the file's bytes go up with
// their image/* content-type, session cookie included.

const API_URL = process.env['NEXT_PUBLIC_API_URL'];
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

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
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Photo is too large (max 5 MB).');
  }

  const res = await fetch(`${API_URL}/api/scan-meal`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': file.type },
    body: file,
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
