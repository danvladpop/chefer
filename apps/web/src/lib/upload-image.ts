const API_URL = process.env['NEXT_PUBLIC_API_URL'];
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

// Keep in sync with the server limit: apps/api/src/routers/uploads.router.ts
// (T-BUG-O1 / O-18 / Q-22 raised it from 5 MB to 10 MB).
const MAX_BYTES = 10 * 1024 * 1024;

// UX-40's four photo-failure sentences (03-ux-design-spec.md lines
// 4460-4485, UX-21 amendment A1) — never a status code, never
// `[object Object]`. Duplicated from apps/mobile/src/lib/media-client.ts:
// apps/web cannot import mobile app code, and this is UI copy, not shared
// business logic.
const PHOTO_TOO_BIG_MESSAGE = 'That photo is too big. Choose another, or use a screenshot of it.';
const NO_CONNECTION_MESSAGE = 'No connection. Try again when you’re back online.';
const SIGNED_OUT_MESSAGE = 'Sign in again to add photos.';
const SOMETHING_WRONG_MESSAGE = 'Something went wrong on our side. Try again in a moment.';

type ApiErrorBody = { error?: string | { code?: string; message?: string } } | null;

/**
 * Maps a failed upload to one of the four user-facing sentences (T-BUG-O1).
 * Reads both error shapes the API can answer with — `{ error: string }` from
 * the uploads router's own checks, `{ error: { code, message } }` from
 * Express's global handler — without ever putting the field's raw content
 * into the thrown Error, which is what used to render as "[object Object]".
 */
function uploadErrorFrom(status: number | null, body: unknown): Error {
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

/**
 * Uploads an image file (phone or PC file picker) to the API's upload endpoint
 * as a raw body. Returns the public URL of the stored file.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(PHOTO_TOO_BIG_MESSAGE);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/uploads/image`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': file.type },
      body: file,
    });
  } catch {
    throw uploadErrorFrom(null, null);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiErrorBody;
    throw uploadErrorFrom(res.status, data);
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}
