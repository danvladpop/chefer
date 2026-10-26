import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { isValidGtin } from '@chefer/types';

// ─── Barcode photo → GTIN (ADR 0006, stage 1) ─────────────────────────────────
// The app photographs the barcode with the image picker it already ships and
// this decodes it server-side, so packaged-food logging needed no native
// module. ZXing-C++ compiled to WebAssembly (zxing-wasm): no network, no
// native binary; the .wasm is read from node_modules once, on first use (the
// library would otherwise fetch it from a CDN).

let prepared = false;
function prepare(): void {
  if (prepared) return;
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
  prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
    },
  });
  prepared = true;
}

/** ZXing decodes JPEG and PNG itself; anything else goes through sharp first. */
async function toDecodable(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  if (mime === 'image/jpeg' || mime === 'image/png') return bytes;
  try {
    const { default: sharp } = await import('sharp');
    return new Uint8Array(await sharp(bytes, { limitInputPixels: 50_000_000 }).png().toBuffer());
  } catch {
    return null;
  }
}

/** UPC-A is EAN-13 with a leading 0: store and look up one form only. */
export function canonicalGtin(digits: string): string {
  return digits.length === 12 ? `0${digits}` : digits;
}

/**
 * The retail barcodes (EAN-13, EAN-8, UPC-A) in a photo, canonical and
 * check-digit valid, most prominent first. Empty when none can be read.
 */
export async function decodeBarcodePhoto(bytes: Uint8Array, mime: string): Promise<string[]> {
  const image = await toDecodable(bytes, mime);
  if (!image) return [];
  prepare();
  const results = await readBarcodes(image, {
    formats: ['EAN13', 'EAN8', 'UPCA'],
    tryHarder: true,
    tryRotate: true,
    maxNumberOfSymbols: 4,
  });
  const codes = results
    .filter((r) => r.isValid)
    .map((r) => canonicalGtin(r.text.replace(/\D/g, '')))
    .filter(isValidGtin);
  return [...new Set(codes)];
}
