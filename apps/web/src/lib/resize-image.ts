import { UPLOAD_LIMITS } from '@chefer/types';

// ─── Resize a photo in the browser before it is uploaded (Phase 1 guardrails) ─
// A phone camera photo is 3–10 MB; a recipe card or a vision estimate needs
// nowhere near 12–48 MP. The long edge goes to UPLOAD_LIMITS.maxLongEdgePx
// (1600 px, same as the mobile app and the server) at JPEG 0.8 — typically a
// few hundred KB. EXIF orientation is applied while decoding
// (`imageOrientation: 'from-image'`; an <img> fallback applies it by default),
// so a portrait photo stays upright once the metadata is gone. Transparent
// areas are painted white (JPEG has no alpha; the server does the same).
//
// Best effort: when the browser cannot decode the file (HEIC on Chrome, an
// unusual format) or any step fails, the ORIGINAL file is returned and the
// server's own resize handles it. GIFs are passed through untouched (the
// canvas would keep only the first frame of an animation; the server decides).

export interface ResizeOptions {
  maxEdge?: number;
  quality?: number;
}

/** The size that brings the long edge down to `maxEdge`, or null if it already fits. */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number = UPLOAD_LIMITS.maxLongEdgePx,
): { width: number; height: number } | null {
  if (width <= 0 || height <= 0) return null;
  const scale = maxEdge / Math.max(width, height);
  if (scale >= 1) return null;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}.jpg`;
}

/**
 * The photo, resized to fit `maxEdge` and re-encoded as JPEG — or the
 * original file when it already fits and is small, or anything fails.
 */
export async function resizeImageForUpload(file: File, options: ResizeOptions = {}): Promise<File> {
  const maxEdge = options.maxEdge ?? UPLOAD_LIMITS.maxLongEdgePx;
  const quality = options.quality ?? UPLOAD_LIMITS.jpegQuality;
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (typeof document === 'undefined') return file;

  let drawable: Drawable | null = null;
  try {
    drawable = await decode(file);
    const size = targetSize(drawable.width, drawable.height, maxEdge);
    // Already small enough in both senses: keep the original bytes.
    if (!size && file.size <= 1024 * 1024) return file;
    const { width, height } = size ?? { width: drawable.width, height: drawable.height };

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(drawable.source, 0, 0, width, height);

    const blob = await toJpeg(canvas, quality);
    // A re-encode that came out bigger helps nobody.
    if (!blob || (blob.size >= file.size && !size)) return file;
    return new File([blob], jpegName(file.name), { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    drawable?.close();
  }
}
