import type { AiUsageEvent } from '@prisma/client';
import { prisma } from '../client';

// ─── AI usage events (Phase 2 cost tracking) ──────────────────────────────────
// One row per real provider call with its estimated cost (micro-USD). Written
// fire-and-forget by the API's usage recorder; read by the budget checks
// (per-user month, global day), the admin cost summary and the maintenance
// pruning. Quota reservations stay in AiCallLog — see schema.prisma.

export type CreateAiUsageEventData = {
  userId: string | null;
  operation: string;
  workload: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  audioSeconds: number | null;
  images: number | null;
  costMicroUsd: number;
  shadow: boolean;
};

export type AiCostByWorkload = { workload: string; costMicroUsd: number; calls: number };
export type AiCostByUser = { userId: string; costMicroUsd: number; calls: number };

export interface IAiUsageRepository {
  create(data: CreateAiUsageEventData): Promise<AiUsageEvent>;
  /** Total cost (micro-USD) of the calls at or after `since`; one user's only when `userId` is given. */
  sumCostSince(since: Date, userId?: string): Promise<number>;
  /** Cost and call count per workload since `since` (null workload → "other"), most expensive first. */
  costByWorkloadSince(since: Date): Promise<AiCostByWorkload[]>;
  /** The `limit` users with the highest cost since `since` (system calls excluded). */
  topUsersSince(since: Date, limit: number): Promise<AiCostByUser[]>;
  /** How many calls of one workload were made at or after `since`. */
  countSince(since: Date, workload: string): Promise<number>;
  /** Retention: deletes usage events older than `date`. */
  deleteOlderThan(date: Date): Promise<number>;
  /** Retention: deletes quota reservations (AiCallLog) older than `date`. */
  deleteCallLogsOlderThan(date: Date): Promise<number>;
}

export class AiUsageRepository implements IAiUsageRepository {
  create(data: CreateAiUsageEventData): Promise<AiUsageEvent> {
    return prisma.aiUsageEvent.create({ data });
  }

  async sumCostSince(since: Date, userId?: string): Promise<number> {
    const row = await prisma.aiUsageEvent.aggregate({
      where: { createdAt: { gte: since }, ...(userId !== undefined && { userId }) },
      _sum: { costMicroUsd: true },
    });
    return row._sum.costMicroUsd ?? 0;
  }

  async costByWorkloadSince(since: Date): Promise<AiCostByWorkload[]> {
    const rows = await prisma.aiUsageEvent.groupBy({
      by: ['workload'],
      where: { createdAt: { gte: since } },
      _sum: { costMicroUsd: true },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({
        workload: r.workload ?? 'other',
        costMicroUsd: r._sum.costMicroUsd ?? 0,
        calls: r._count._all,
      }))
      .sort((a, b) => b.costMicroUsd - a.costMicroUsd);
  }

  async topUsersSince(since: Date, limit: number): Promise<AiCostByUser[]> {
    const rows = await prisma.aiUsageEvent.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since }, userId: { not: null } },
      _sum: { costMicroUsd: true },
      _count: { _all: true },
      orderBy: { _sum: { costMicroUsd: 'desc' } },
      take: limit,
    });
    return rows.flatMap((r) =>
      r.userId === null
        ? []
        : [{ userId: r.userId, costMicroUsd: r._sum.costMicroUsd ?? 0, calls: r._count._all }],
    );
  }

  countSince(since: Date, workload: string): Promise<number> {
    return prisma.aiUsageEvent.count({ where: { createdAt: { gte: since }, workload } });
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const { count } = await prisma.aiUsageEvent.deleteMany({ where: { createdAt: { lt: date } } });
    return count;
  }

  async deleteCallLogsOlderThan(date: Date): Promise<number> {
    const { count } = await prisma.aiCallLog.deleteMany({ where: { createdAt: { lt: date } } });
    return count;
  }
}

export const aiUsageRepository = new AiUsageRepository();
