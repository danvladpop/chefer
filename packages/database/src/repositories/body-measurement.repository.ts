import type { BodyMeasurement, Prisma } from '@prisma/client';
import { prisma } from '../client';

// Lane D3 (market review 2026-10): body measurements, one row per user and
// local calendar day. Every measure is optional; a write merges into the
// day's row, so logging the waist on a day that already has the hips keeps
// both.

export interface BodyMeasurementValuesData {
  waistCm?: number | undefined;
  hipsCm?: number | undefined;
  chestCm?: number | undefined;
  upperArmCm?: number | undefined;
  thighCm?: number | undefined;
  bodyFatPct?: number | undefined;
}

type Measures = { [K in keyof BodyMeasurementValuesData]?: number };

/** The measures that were given; an absent one keeps the day's stored value. */
function givenMeasures(values: BodyMeasurementValuesData): Measures {
  const out: Measures = {};
  for (const key of Object.keys(values) as (keyof BodyMeasurementValuesData)[]) {
    const value = values[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export interface IBodyMeasurementRepository {
  /** Entries with measuredOn ≥ from, oldest first. */
  listSince(userId: string, from: Date): Promise<BodyMeasurement[]>;
  /** Writes the given measures into the day's row (creating it if needed). */
  upsertForDay(
    userId: string,
    measuredOn: Date,
    values: BodyMeasurementValuesData,
  ): Promise<BodyMeasurement>;
  /** Owner-scoped delete; false when the entry doesn't exist or isn't theirs. */
  deleteForUser(userId: string, id: string): Promise<boolean>;
}

export class BodyMeasurementRepository implements IBodyMeasurementRepository {
  async listSince(userId: string, from: Date): Promise<BodyMeasurement[]> {
    return prisma.bodyMeasurement.findMany({
      where: { userId, measuredOn: { gte: from } },
      orderBy: { measuredOn: 'asc' },
    });
  }

  async upsertForDay(
    userId: string,
    measuredOn: Date,
    values: BodyMeasurementValuesData,
  ): Promise<BodyMeasurement> {
    const measures = givenMeasures(values);
    return prisma.bodyMeasurement.upsert({
      where: { userId_measuredOn: { userId, measuredOn } },
      create: { userId, measuredOn, ...measures },
      update: measures,
    });
  }

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.bodyMeasurement.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  /** For consent withdrawal: every entry of the user, inside a transaction. */
  deleteAllForUser(userId: string): Prisma.PrismaPromise<Prisma.BatchPayload> {
    return prisma.bodyMeasurement.deleteMany({ where: { userId } });
  }
}

export const bodyMeasurementRepository = new BodyMeasurementRepository();
