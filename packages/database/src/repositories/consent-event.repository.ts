import type { ConsentEvent, ConsentKind } from '@prisma/client';
import { prisma } from '../client';

// ─── Consent log (§2.13, T-39.1-39.5, S14) ─────────────────────────────────────
// Append-only — every consent write goes through ConsentService.record()
// (wave 1), which writes here AND refreshes the relevant User cache column
// in one transaction. This repository never updates a row.

export interface RecordConsentEventData {
  userId: string;
  kind: ConsentKind;
  granted: boolean;
  providers?: string[];
  documentVersion?: string | null;
  /** 'web' | 'mobile' | 'migration'. */
  source: string;
}

export interface IConsentEventRepository {
  record(data: RecordConsentEventData): Promise<ConsentEvent>;
  findLatestByKind(userId: string, kind: ConsentKind): Promise<ConsentEvent | null>;
  findAllByUser(userId: string): Promise<ConsentEvent[]>;
  /** Whether a userId already has an event of this kind + source (idempotent backfill guard). */
  existsForUserKindSource(userId: string, kind: ConsentKind, source: string): Promise<boolean>;
}

export class ConsentEventRepository implements IConsentEventRepository {
  async record(data: RecordConsentEventData): Promise<ConsentEvent> {
    return prisma.consentEvent.create({ data: { ...data, providers: data.providers ?? [] } });
  }

  async findLatestByKind(userId: string, kind: ConsentKind): Promise<ConsentEvent | null> {
    return prisma.consentEvent.findFirst({
      where: { userId, kind },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllByUser(userId: string): Promise<ConsentEvent[]> {
    return prisma.consentEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async existsForUserKindSource(
    userId: string,
    kind: ConsentKind,
    source: string,
  ): Promise<boolean> {
    const count = await prisma.consentEvent.count({ where: { userId, kind, source } });
    return count > 0;
  }
}

export const consentEventRepository = new ConsentEventRepository();
