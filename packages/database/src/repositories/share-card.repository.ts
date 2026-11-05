import type { Prisma, ShareCard } from '@prisma/client';
import { prisma } from '../client';

// Lane E2 (market review 2026-10): share-card snapshots. One row per card the
// user chose to share; `payload` holds only what the card shows
// (shareCardPayload, @chefer/types). Deleted with the account (cascade).

export interface CreateShareCardData {
  id: string;
  userId: string;
  kind: string;
  payload: Prisma.InputJsonValue;
}

export interface IShareCardRepository {
  create(data: CreateShareCardData): Promise<ShareCard>;
  findById(id: string): Promise<ShareCard | null>;
}

export class ShareCardRepository implements IShareCardRepository {
  create(data: CreateShareCardData): Promise<ShareCard> {
    return prisma.shareCard.create({ data });
  }

  findById(id: string): Promise<ShareCard | null> {
    return prisma.shareCard.findUnique({ where: { id } });
  }
}

export const shareCardRepository = new ShareCardRepository();
