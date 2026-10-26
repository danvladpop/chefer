import { TRPCError } from '@trpc/server';
import {
  bodyMeasurementRepository,
  type BodyMeasurement,
  type IBodyMeasurementRepository,
} from '@chefer/database';
import { hasAnyMeasure, type BodyMeasurementDto, type BodyMeasurementValues } from '@chefer/types';

// ─── Body measurements (market review 2026-10, lane D3) ──────────────────────
// Free for everyone: waist, hips, chest, upper arm, thigh (cm) and body fat
// (%), one entry per local calendar day. The router guards the writes with
// the health-data consent check, like weigh-ins.

const DAY_MS = 86_400_000;

/** A stored row as the clients see it: the day as `YYYY-MM-DD`. */
export function toBodyMeasurementDto(row: BodyMeasurement): BodyMeasurementDto {
  return {
    id: row.id,
    measuredOn: row.measuredOn.toISOString().slice(0, 10),
    waistCm: row.waistCm,
    hipsCm: row.hipsCm,
    chestCm: row.chestCm,
    upperArmCm: row.upperArmCm,
    thighCm: row.thighCm,
    bodyFatPct: row.bodyFatPct,
  };
}

export class BodyMeasurementService {
  constructor(private readonly repo: IBodyMeasurementRepository = bodyMeasurementRepository) {}

  /** The last `days` days of entries, oldest first. */
  async list(userId: string, days: number, now: Date = new Date()): Promise<BodyMeasurementDto[]> {
    const from = new Date(now.getTime() - days * DAY_MS);
    from.setUTCHours(0, 0, 0, 0);
    const rows = await this.repo.listSince(userId, from);
    return rows.map(toBodyMeasurementDto);
  }

  /**
   * Writes the given measures into the day's entry; measures left out keep
   * what that day already had. `date` is the client's local calendar day.
   */
  async log(
    userId: string,
    date: string,
    values: BodyMeasurementValues,
  ): Promise<BodyMeasurementDto> {
    if (!hasAnyMeasure(values)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter at least one measurement.' });
    }
    const row = await this.repo.upsertForDay(userId, new Date(`${date}T00:00:00Z`), values);
    return toBodyMeasurementDto(row);
  }

  async delete(userId: string, id: string): Promise<{ success: true }> {
    const deleted = await this.repo.deleteForUser(userId, id);
    if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Measurement not found' });
    return { success: true };
  }
}

export const bodyMeasurementService = new BodyMeasurementService();
