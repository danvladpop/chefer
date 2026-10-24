import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userRepository } from '@chefer/database';
import {
  AI_CONSENT_REQUIRED_MESSAGE,
  BARCODE_INVALID_MESSAGE,
  type UserProfile,
} from '@chefer/types';
import { productsRouter } from './products.router.js';

// ADR 0005: barcode lookup, photo decode, search and saving your own product
// are free and never ask for AI consent; the label scan is AI-consent gated
// (R-10) before the service (and its Snap-to-Log quota) runs.

vi.mock('../lib/env.js', () => ({
  env: new Proxy({}, { get: (_t, key) => (key === 'AI_CONSENT_ENFORCE' ? 'on' : undefined) }),
}));
vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  userRepository: { findAiDataConsentAt: vi.fn() },
}));
const service = vi.hoisted(() => ({
  lookupBarcode: vi.fn().mockResolvedValue({ status: 'not_found', barcode: 'x' }),
  lookupBarcodePhoto: vi.fn().mockResolvedValue({ status: 'unreadable' }),
  scanLabel: vi.fn().mockResolvedValue({ draft: {}, notes: [], confidence: 'high' }),
  create: vi.fn().mockResolvedValue({ product: {}, warnings: [] }),
  search: vi.fn().mockResolvedValue([]),
}));
vi.mock('../application/products/products.service.js', () => ({ productsService: service }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const free: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const caller = (user: UserProfile = free) =>
  productsRouter.createCaller({
    user,
    requestId: 't',
    ipAddress: '127.0.0.1',
    sessionToken: null,
    isMobileClient: true,
    clientApiLevel: 6,
    res: {} as Response,
  });
const photo = { imageBase64: 'a'.repeat(200), mimeType: 'image/jpeg' as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(null);
});

describe('products router', () => {
  it('lookupBarcode is free, strips spaces and refuses a bad check digit', async () => {
    await caller().lookupBarcode({ barcode: '3017 6204 22003' });
    expect(service.lookupBarcode).toHaveBeenCalledWith('u1', '3017620422003');
    await expect(caller().lookupBarcode({ barcode: '3017620422004' })).rejects.toThrow(
      BARCODE_INVALID_MESSAGE,
    );
    expect(userRepository.findAiDataConsentAt).not.toHaveBeenCalled();
  });

  it('lookupBarcodePhoto and create never ask for AI consent', async () => {
    await caller().lookupBarcodePhoto(photo);
    await caller().create({
      source: 'USER',
      barcode: null,
      name: 'Granola',
      brand: null,
      per100g: {
        kcal: 450,
        protein: null,
        carbs: null,
        fat: null,
        fiber: null,
        sugar: null,
        saturatedFat: null,
        salt: null,
      },
      servingSizeG: null,
      allergens: { known: false, contains: [] },
    });
    expect(service.lookupBarcodePhoto).toHaveBeenCalledTimes(1);
    expect(service.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ name: 'Granola' }),
      'USER',
    );
    expect(userRepository.findAiDataConsentAt).not.toHaveBeenCalled();
  });

  it('create rejects an allergen outside the taxonomy', async () => {
    await expect(
      caller().create({
        source: 'USER',
        barcode: null,
        name: 'X',
        brand: null,
        per100g: {
          kcal: 1,
          protein: null,
          carbs: null,
          fat: null,
          fiber: null,
          sugar: null,
          saturatedFat: null,
          salt: null,
        },
        servingSizeG: null,
        allergens: { known: true, contains: ['kiwi'] },
      }),
    ).rejects.toThrow(/Unknown allergen/);
  });

  it('scanLabel without AI consent is refused before the service runs', async () => {
    await expect(caller().scanLabel(photo)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: AI_CONSENT_REQUIRED_MESSAGE,
    });
    expect(service.scanLabel).not.toHaveBeenCalled();
  });

  it('scanLabel with consent runs (the service owns the premium quota)', async () => {
    vi.mocked(userRepository.findAiDataConsentAt).mockResolvedValue(new Date());
    await caller().scanLabel({ ...photo, barcode: '96385074' });
    expect(service.scanLabel).toHaveBeenCalledWith(
      free,
      photo.imageBase64,
      'image/jpeg',
      '96385074',
    );
  });
});
