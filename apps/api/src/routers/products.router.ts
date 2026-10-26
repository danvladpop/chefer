import { z } from 'zod';
import { barcodeSchema, packagedProductDraftSchema } from '@chefer/types';
import { productsService } from '../application/products/products.service.js';
import { aiConsentProcedure, protectedProcedure, router } from '../lib/trpc.js';

// ─── Packaged products (ADR 0006) ─────────────────────────────────────────────
// Barcode lookup, barcode-photo decode, product search and saving your own
// product are FREE. scanLabel is the premium photo-AI path: AI-consent gated
// here (R-10), Snap-to-Log quota inside the service. Logging a product is
// `tracker.logProduct`.

// ~5.4 MB of base64 ≈ a 4 MB image (same cap as recipe import; express.json caps at 10 MB).
const MAX_IMAGE_BASE64_CHARS = 5_600_000;

const photoSchema = z.object({
  imageBase64: z.string().min(100).max(MAX_IMAGE_BASE64_CHARS),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
});

export const productsRouter = router({
  /**
   * One barcode → the user's own product, Chefer's cached Open Food Facts
   * row, or a fresh OFF fetch. Every scan path ends here, including the live
   * scanner of a later native build: it only has to pass the digits.
   */
  lookupBarcode: protectedProcedure
    .input(z.object({ barcode: barcodeSchema }))
    .query(async ({ ctx, input }) => {
      return productsService.lookupBarcode(ctx.user.id, input.barcode);
    }),

  /** A photo of a barcode, decoded on the server, then the same lookup. `unreadable` when none is found. */
  lookupBarcodePhoto: protectedProcedure.input(photoSchema).mutation(async ({ ctx, input }) => {
    return productsService.lookupBarcodePhoto(ctx.user.id, input.imageBase64, input.mimeType);
  }),

  /** Premium: a nutrition-label photo → a draft to review. Nothing is saved. */
  scanLabel: aiConsentProcedure
    .input(photoSchema.extend({ barcode: barcodeSchema.nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      return productsService.scanLabel(
        ctx.user,
        input.imageBase64,
        input.mimeType,
        input.barcode ?? null,
      );
    }),

  /** Saves the user's own product: a reviewed label scan (`LABEL`) or typed in (`USER`). Private to them. */
  create: protectedProcedure
    .input(packagedProductDraftSchema.extend({ source: z.enum(['LABEL', 'USER']) }))
    .mutation(async ({ ctx, input }) => {
      const { source, ...draft } = input;
      return productsService.create(ctx.user.id, draft, source);
    }),

  /** Name, brand or exact-barcode search over cached products and the user's own. */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(2).max(80),
        limit: z.number().int().min(1).max(20).default(8),
      }),
    )
    .query(async ({ ctx, input }) => {
      return productsService.search(ctx.user.id, input.query, input.limit);
    }),
});
