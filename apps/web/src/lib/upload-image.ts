const API_URL = process.env['NEXT_PUBLIC_API_URL'];
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

/**
 * Uploads an image file (phone or PC file picker) to the API's upload endpoint
 * as a raw body. Returns the public URL of the stored file.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image is too large (max 5 MB).');
  }

  const res = await fetch(`${API_URL}/api/uploads/image`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': file.type },
    body: file,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Upload failed (${res.status})`);
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}
