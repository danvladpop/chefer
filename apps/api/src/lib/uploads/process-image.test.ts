import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ImageProcessingError, processUploadedImage } from './process-image.js';

// Phase 1 guardrails: the real sharp on small generated fixtures (no files).

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#c0392b' } });
}

describe('processUploadedImage', () => {
  it('caps the long edge at 1080 px, keeping the aspect ratio', async () => {
    const input = await solid(3200, 2000).png().toBuffer();
    const out = await processUploadedImage(input);
    expect(out).toMatchObject({ mime: 'image/jpeg', ext: 'jpg', width: 1080, height: 675 });
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([1080, 675]);
  });

  it('never upscales a small photo', async () => {
    const out = await processUploadedImage(await solid(400, 300).jpeg().toBuffer());
    expect([out.width, out.height]).toEqual([400, 300]);
  });

  it('applies the EXIF orientation, then strips every bit of metadata', async () => {
    // A landscape-encoded photo tagged "rotate 90°" (orientation 6), with EXIF.
    const input = await solid(300, 200)
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'someone' } } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processUploadedImage(input);
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([200, 300]); // upright portrait
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it('flattens transparency onto white', async () => {
    const input = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const out = await processUploadedImage(input);
    const { data } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
  });

  it('refuses an animated image', async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 8, height: 8, channels: 3, background } })
        .png()
        .toBuffer();
    const frames = await Promise.all([frame('#ff0000'), frame('#0000ff')]);
    const gif = await sharp(frames, { join: { animated: true } })
      .gif()
      .toBuffer();
    await expect(processUploadedImage(gif)).rejects.toMatchObject({ reason: 'ANIMATED' });
  });

  it('refuses bytes that do not decode', async () => {
    const err = await processUploadedImage(Buffer.from('not an image')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImageProcessingError);
    expect((err as ImageProcessingError).reason).toBe('UNREADABLE');
  });
});
