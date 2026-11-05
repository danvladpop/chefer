import * as FileSystem from 'expo-file-system/legacy';

// ─── Progress photos, on this phone only (lane D4, owner decision 2026-10-22) ─
// Never uploaded and never written to the camera roll: each photo is copied
// into the app's private documents folder, one folder per signed-in user (so
// a second account on the same phone never sees them), with a small JSON
// index next to the files. Deleting the app deletes them; so does deleting
// the account from inside the app (`removeAllProgressPhotos`).
//
// `expo-file-system` ships in every binary (it is part of `expo`), so this is
// OTA-safe.

export interface ProgressPhoto {
  id: string;
  /** The local calendar day the photo is for, `YYYY-MM-DD`. */
  takenOn: string;
  /** File name inside the user's folder. */
  file: string;
}

const ROOT = 'progress-photos';
const INDEX = 'index.json';

/** The user's folder; null when the platform has no documents folder (web, tests). */
function folderFor(userId: string): string | null {
  const docs = FileSystem.documentDirectory;
  if (!docs) return null;
  // Ids are cuids; anything else is kept out of the path.
  return `${docs}${ROOT}/${userId.replace(/[^a-zA-Z0-9_-]/g, '')}/`;
}

async function ensureFolder(folder: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(folder);
  if (!info.exists) await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
}

function isPhoto(value: unknown): value is ProgressPhoto {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Record<keyof ProgressPhoto, unknown>>;
  return (
    typeof v.id === 'string' &&
    typeof v.file === 'string' &&
    typeof v.takenOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.takenOn)
  );
}

async function readIndex(folder: string): Promise<ProgressPhoto[]> {
  const info = await FileSystem.getInfoAsync(`${folder}${INDEX}`);
  if (!info.exists) return [];
  try {
    const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(`${folder}${INDEX}`));
    return Array.isArray(parsed) ? parsed.filter(isPhoto) : [];
  } catch {
    // A damaged index never loses the files; the next add rewrites it.
    return [];
  }
}

async function writeIndex(folder: string, photos: readonly ProgressPhoto[]): Promise<void> {
  await FileSystem.writeAsStringAsync(`${folder}${INDEX}`, JSON.stringify(photos));
}

/** Newest first (by day, then by when it was added). */
export function sortPhotos(photos: readonly ProgressPhoto[]): ProgressPhoto[] {
  return [...photos].sort((a, b) =>
    a.takenOn === b.takenOn ? (a.id < b.id ? 1 : -1) : a.takenOn < b.takenOn ? 1 : -1,
  );
}

/** The user's photos, newest first, each with the file's full URI. */
export async function listProgressPhotos(
  userId: string,
): Promise<(ProgressPhoto & { uri: string })[]> {
  const folder = folderFor(userId);
  if (!folder) return [];
  const photos = await readIndex(folder);
  return sortPhotos(photos).map((p) => ({ ...p, uri: `${folder}${p.file}` }));
}

/**
 * Copies a picked (and already resized) image into the user's private folder
 * and records it for `takenOn`. Returns the stored photo.
 */
export async function addProgressPhoto(
  userId: string,
  sourceUri: string,
  takenOn: string,
): Promise<ProgressPhoto> {
  const folder = folderFor(userId);
  if (!folder) throw new Error('Progress photos need the app on a phone.');
  await ensureFolder(folder);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const file = `${id}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: `${folder}${file}` });
  const photo: ProgressPhoto = { id, takenOn, file };
  await writeIndex(folder, [...(await readIndex(folder)), photo]);
  return photo;
}

/** Deletes one photo (the file and its index entry). */
export async function removeProgressPhoto(userId: string, id: string): Promise<void> {
  const folder = folderFor(userId);
  if (!folder) return;
  const photos = await readIndex(folder);
  const photo = photos.find((p) => p.id === id);
  if (photo) await FileSystem.deleteAsync(`${folder}${photo.file}`, { idempotent: true });
  await writeIndex(
    folder,
    photos.filter((p) => p.id !== id),
  );
}

/** Deletes every photo of the user (account deletion). */
export async function removeAllProgressPhotos(userId: string): Promise<void> {
  const folder = folderFor(userId);
  if (!folder) return;
  await FileSystem.deleteAsync(folder, { idempotent: true });
}
