// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizeImageForUpload, targetSize } from './resize-image';

// Phase 1 guardrails: photos are shrunk in the browser before upload. jsdom
// has no image decoder or canvas, so the browser APIs are stubbed: the test
// checks what we ASK the browser to do (orientation, size, format), and that
// every failure falls back to the original file.

function file(bytes: number, type = 'image/jpeg', name = 'IMG_0001.HEIC.jpg'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Stubs createImageBitmap + the canvas jsdom lacks; returns the spies. */
function stubBrowser(width: number, height: number, outBytes = 300_000) {
  const close = vi.fn();
  const createImageBitmap = vi.fn(() => Promise.resolve({ width, height, close }));
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  const drawImage = vi.fn();
  const ctx = { drawImage, fillRect: vi.fn(), fillStyle: '', imageSmoothingQuality: '' };
  const canvases: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvases.push(this);
    return ctx as unknown as CanvasRenderingContext2D;
  });
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((cb: BlobCallback, type?: string) =>
      cb(new Blob([new Uint8Array(outBytes)], { type: type ?? '' })),
    );
  return { createImageBitmap, drawImage, toBlob, canvases, close };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('targetSize', () => {
  it('brings the long edge down to 1080 px, keeping the aspect ratio', () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 1080, height: 810 });
    expect(targetSize(3024, 4032)).toEqual({ width: 810, height: 1080 });
  });

  it('leaves a photo that already fits alone, and never upscales', () => {
    expect(targetSize(1080, 900)).toBeNull();
    expect(targetSize(800, 600)).toBeNull();
    expect(targetSize(0, 0)).toBeNull();
  });
});

describe('resizeImageForUpload', () => {
  it('decodes with the EXIF orientation applied and re-encodes a large photo as a 1080 px JPEG 0.75', async () => {
    const browser = stubBrowser(4032, 3024);
    const out = await resizeImageForUpload(file(6_000_000));

    expect(browser.createImageBitmap).toHaveBeenCalledWith(expect.any(File), {
      imageOrientation: 'from-image',
    });
    expect([browser.canvases[0]?.width, browser.canvases[0]?.height]).toEqual([1080, 810]);
    expect(browser.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1080, 810);
    expect(browser.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.75);
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBe(300_000);
    expect(out.name).toBe('IMG_0001.HEIC.jpg');
    expect(browser.close).toHaveBeenCalled();
  });

  it('keeps a small photo that already fits as is', async () => {
    stubBrowser(1000, 750);
    const original = file(200_000);
    expect(await resizeImageForUpload(original)).toBe(original);
  });

  it('falls back to the original when the browser cannot decode it', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('unsupported'))),
    );
    const original = file(6_000_000, 'image/heic', 'a.heic');
    expect(await resizeImageForUpload(original)).toBe(original);
  });

  it('passes GIFs and non-images through untouched', async () => {
    const browser = stubBrowser(4000, 4000);
    const gif = file(6_000_000, 'image/gif', 'a.gif');
    const pdf = file(10, 'application/pdf', 'a.pdf');
    expect(await resizeImageForUpload(gif)).toBe(gif);
    expect(await resizeImageForUpload(pdf)).toBe(pdf);
    expect(browser.createImageBitmap).not.toHaveBeenCalled();
  });
});
