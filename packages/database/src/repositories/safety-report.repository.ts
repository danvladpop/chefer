import type { Prisma, SafetyReport } from '@prisma/client';
import { prisma } from '../client';

// ─── Safety reports (§2.1, T-01.5, S3) ─────────────────────────────────────────
// "Report this recipe" (UX-01 d). Part of the safety table itself:
// SafetyService.loadTable (wave 1) includes a user's reported recipe ids and
// filter() removes them. Business logic (dedup rules, notifications) is
// wave 1 — this repository is read/write only.

export interface CreateSafetyReportData {
  userId: string;
  recipeId: string;
  surface: string;
  reason: string;
  note?: string | null;
  rulesSnapshot: Prisma.InputJsonValue;
}

export interface ISafetyReportRepository {
  create(data: CreateSafetyReportData): Promise<SafetyReport>;
  /** Every recipe id this user has reported — SafetyService.loadTable filters these out. */
  findRecipeIdsByUser(userId: string): Promise<string[]>;
  findAllByUser(userId: string): Promise<SafetyReport[]>;
}

export class SafetyReportRepository implements ISafetyReportRepository {
  async create(data: CreateSafetyReportData): Promise<SafetyReport> {
    return prisma.safetyReport.create({ data });
  }

  async findRecipeIdsByUser(userId: string): Promise<string[]> {
    const rows = await prisma.safetyReport.findMany({
      where: { userId },
      select: { recipeId: true },
      distinct: ['recipeId'],
    });
    return rows.map((r) => r.recipeId);
  }

  async findAllByUser(userId: string): Promise<SafetyReport[]> {
    return prisma.safetyReport.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}

export const safetyReportRepository = new SafetyReportRepository();
