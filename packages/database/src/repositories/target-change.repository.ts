import type { Prisma, TargetChange, TargetChangeKind } from '@prisma/client';
import { prisma } from '../client';

// ─── Target changes (§2.11, T-11.1, S12) ───────────────────────────────────────
// "Never change your targets silently" made provable — one row per detected
// change or proposal. Detection + the 14-day lazy auto-resolve rule are
// wave 1 (T-11.1) — this repository is read/write only.

export interface CreateTargetChangeData {
  userId: string;
  kind: TargetChangeKind;
  reason: string;
  fields: Prisma.InputJsonValue;
}

export interface ITargetChangeRepository {
  create(data: CreateTargetChangeData): Promise<TargetChange>;
  findById(id: string): Promise<TargetChange | null>;
  /** Every row not yet resolved, newest first. */
  findUnresolvedByUser(userId: string): Promise<TargetChange[]>;
  resolve(id: string, resolution: 'USE_NEW' | 'KEEP_OLD' | 'AUTO'): Promise<TargetChange>;
  findAllByUser(userId: string): Promise<TargetChange[]>;
}

export class TargetChangeRepository implements ITargetChangeRepository {
  async create(data: CreateTargetChangeData): Promise<TargetChange> {
    return prisma.targetChange.create({ data });
  }

  async findById(id: string): Promise<TargetChange | null> {
    return prisma.targetChange.findUnique({ where: { id } });
  }

  async findUnresolvedByUser(userId: string): Promise<TargetChange[]> {
    return prisma.targetChange.findMany({
      where: { userId, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolve(id: string, resolution: 'USE_NEW' | 'KEEP_OLD' | 'AUTO'): Promise<TargetChange> {
    return prisma.targetChange.update({
      where: { id },
      data: { resolvedAt: new Date(), resolution },
    });
  }

  async findAllByUser(userId: string): Promise<TargetChange[]> {
    return prisma.targetChange.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}

export const targetChangeRepository = new TargetChangeRepository();
