import { resizeImageForUpload } from '@/lib/resize-image';

// Packaged products (ADR 0005): a barcode or nutrition-label photo is shrunk
// in the browser (1080 px JPEG, like the app) and sent through tRPC as base64.

export type ProductPhoto = {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
};

const MIME_TYPES = new Set<ProductPhoto['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

export async function productPhotoFromFile(picked: File): Promise<ProductPhoto> {
  const file = await resizeImageForUpload(picked);
  const mimeType = (
    MIME_TYPES.has(file.type as ProductPhoto['mimeType']) ? file.type : 'image/jpeg'
  ) as ProductPhoto['mimeType'];
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Couldn’t read that photo. Choose another.'));
    reader.onerror = () => reject(new Error('Couldn’t read that photo. Choose another.'));
    reader.readAsDataURL(file);
  });
  return { imageBase64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType };
}
