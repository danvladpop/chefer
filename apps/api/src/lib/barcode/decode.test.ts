import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { canonicalGtin, decodeBarcodePhoto } from './decode.js';

// Round trip through ZXing's own writer: the photo path must read the
// retail barcodes a pack carries, as JPEG (what both apps send) and PNG.

async function barcodePng(text: string, format: 'EAN13' | 'EAN8' | 'UPCA'): Promise<Uint8Array> {
  const out = await writeBarcode(text, { format, scale: 4 });
  if (!out.image) throw new Error(out.error);
  return new Uint8Array(await out.image.arrayBuffer());
}

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm'));
  prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
    },
  });
});

describe('decodeBarcodePhoto', () => {
  it('reads an EAN-13 from a PNG', async () => {
    expect(
      await decodeBarcodePhoto(await barcodePng('3017620422003', 'EAN13'), 'image/png'),
    ).toEqual(['3017620422003']);
  });

  it('reads an EAN-8 from a JPEG on a padded, photo-like canvas', async () => {
    const png = await barcodePng('96385074', 'EAN8');
    const jpeg = await sharp(png)
      .extend({ top: 120, bottom: 120, left: 160, right: 160, background: '#f4efe6' })
      .jpeg({ quality: 75 })
      .toBuffer();
    expect(await decodeBarcodePhoto(new Uint8Array(jpeg), 'image/jpeg')).toEqual(['96385074']);
  });

  it('returns UPC-A in its EAN-13 form, and WebP goes through sharp', async () => {
    const webp = await sharp(await barcodePng('036000291452', 'UPCA'))
      .webp()
      .toBuffer();
    expect(await decodeBarcodePhoto(new Uint8Array(webp), 'image/webp')).toEqual(['0036000291452']);
  });

  it('returns nothing for a photo with no barcode', async () => {
    const blank = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    expect(await decodeBarcodePhoto(new Uint8Array(blank), 'image/jpeg')).toEqual([]);
  });

  it('canonicalGtin pads UPC-A only', () => {
    expect(canonicalGtin('036000291452')).toBe('0036000291452');
    expect(canonicalGtin('96385074')).toBe('96385074');
  });
});
