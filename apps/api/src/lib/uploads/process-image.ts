import type Sharp from 'sharp';
import { UPLOAD_LIMITS } from '@chefer/types';

// ─── Server-side photo normalisation (Phase 1 guardrails) ─────────────────────
// Every uploaded photo is re-encoded before it is stored, whatever the client
// did (old app binaries and scripts upload originals):
//   - auto-rotated from its EXIF orientation, then ALL metadata dropped (sharp
//     writes none unless asked — no GPS position leaves in a shared recipe);
//   - long edge capped at UPLOAD_LIMITS.maxLongEdgePx (1080 px), never upscaled;
//   - re-encoded as JPEG quality 75 (mozjpeg), transparency flattened onto
//     white. JPEG, not WebP: the weekly emails embed recipe photos, and email
//     clients still render WebP unreliably.
// Animated images (GIF/WebP with several frames) are refused: a recipe photo
// is a still, and keeping animations would mean storing them unresized.
//
// The 1 GB VM shapes the settings: one libvips thread, no operation cache, and
// a pixel ceiling that refuses decompression bombs before decoding them.

// sharp is a native module. It is loaded on the first upload rather than at
// import time, so a missing or broken binary in the image (e.g. a new CPU
// architecture) breaks photo uploads only — not the whole API at boot.
let sharpModule: Promise<typeof Sharp> | undefined;
function loadSharp(): Promise<typeof Sharp> {
  sharpModule ??= import('sharp').then(
    ({ default: sharp }) => {
      sharp.concurrency(1);
      sharp.cache(false);
      return sharp;
    },
    (err: unknown) => {
      sharpModule = undefined; // retry on the next upload
      console.error('[uploads] sharp failed to load; photo uploads are unavailable', err);
      throw err;
    },
  );
  return sharpModule;
}

/** 48 MP phone sensors fit; anything larger is refused before decoding. */
export const MAX_INPUT_PIXELS = 50_000_000;
export const OUTPUT_JPEG_QUALITY = Math.round(UPLOAD_LIMITS.jpegQuality * 100);

export type ImageRejection = 'ANIMATED' | 'UNREADABLE';

export class ImageProcessingError extends Error {
  constructor(readonly reason: ImageRejection) {
    super(
      reason === 'ANIMATED'
        ? "Animated images aren't supported. Choose a still photo."
        : 'The file is not a valid image of that type',
    );
    this.name = 'ImageProcessingError';
  }
}

export interface ProcessedImage {
  bytes: Buffer;
  mime: 'image/jpeg';
  ext: 'jpg';
  width: number;
  height: number;
}

/** Auto-orient, strip metadata, cap the long edge, re-encode as JPEG. */
export async function processUploadedImage(
  input: Buffer,
  maxEdge: number = UPLOAD_LIMITS.maxLongEdgePx,
): Promise<ProcessedImage> {
  const sharp = await loadSharp();
  let pages: number;
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    pages = meta.pages ?? 1;
  } catch {
    throw new ImageProcessingError('UNREADABLE');
  }
  if (pages > 1) throw new ImageProcessingError('ANIMATED');

  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // EXIF orientation → pixels (the tag itself is dropped below)
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: OUTPUT_JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, mime: 'image/jpeg', ext: 'jpg', width: info.width, height: info.height };
  } catch {
    throw new ImageProcessingError('UNREADABLE');
  }
}
