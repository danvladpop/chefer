import { v2 as cloudinary } from 'cloudinary';
import { env } from '../env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a base64-encoded image string to Cloudinary.
 * Uses recipeId as the stable public_id — repeated uploads are idempotent.
 * Returns the secure HTTPS CDN URL.
 */
export async function uploadRecipeImage(
  base64Image: string,
  mimeType: string,
  recipeId: string,
): Promise<string> {
  // Use the MIME type returned by Imagen (may be image/png or image/jpeg)
  const dataUri = `data:${mimeType};base64,${base64Image}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: recipeId, // no 'recipes/' prefix — folder param handles it
    folder: 'chefer/recipes',
    overwrite: true,
    transformation: [
      { width: 800, height: 600, crop: 'fill', quality: 'auto', fetch_format: 'auto' },
    ],
  });

  return result.secure_url;
}
