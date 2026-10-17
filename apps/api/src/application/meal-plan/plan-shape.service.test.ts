import { describe, expect, it, vi } from 'vitest';
import type { IDietaryPreferencesRepository } from '@chefer/database';
import type { PlanSettingsInput } from '@chefer/types';
import { PlanShapeService } from './plan-shape.service.js';

function makeRepo(
  overrides: Partial<IDietaryPreferencesRepository> = {},
): IDietaryPreferencesRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PlanShapeService (T-07.1)', () => {
  it('AC7: no stored row returns the legacy shape (breakfast/lunch/dinner, every day, no cap)', async () => {
    const service = new PlanShapeService(makeRepo());
    const shape = await service.getShape('user1');
    expect(shape).toEqual({
      slots: ['breakfast', 'lunch', 'dinner'],
      days: [0, 1, 2, 3, 4, 5, 6],
      timeCapMins: null,
      weekendNoLimit: false,
      cookingFor: null,
      leftovers: false,
      fitTrainingDays: null,
    });
  });

  it('AC7: a row with `[]` planSlots (the legacy sentinel) also returns the legacy shape', async () => {
    const repo = makeRepo({
      findByUserId: vi.fn().mockResolvedValue({
        planSlots: [],
        planDays: [],
        timeCapMins: null,
        weekendNoLimit: false,
        cookingFor: null,
        leftovers: false,
      }),
    });
    const shape = await new PlanShapeService(repo).getShape('user1');
    expect(shape.slots).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(shape.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns a stored, non-legacy shape as-is', async () => {
    const stored = {
      planSlots: ['dinner'],
      planDays: [0, 1, 2, 3],
      timeCapMins: 15,
      weekendNoLimit: true,
      cookingFor: 2,
      leftovers: true,
    };
    const repo = makeRepo({ findByUserId: vi.fn().mockResolvedValue(stored) });
    const shape = await new PlanShapeService(repo).getShape('user1');
    expect(shape).toEqual({
      slots: ['dinner'],
      days: [0, 1, 2, 3],
      timeCapMins: 15,
      weekendNoLimit: true,
      cookingFor: 2,
      leftovers: true,
      fitTrainingDays: null,
    });
  });

  it('setShape upserts every field (bug B-27: leftovers persists on the same row)', async () => {
    const repo = makeRepo();
    const service = new PlanShapeService(repo);
    const shape: PlanSettingsInput = {
      slots: ['dinner'],
      days: [0, 1, 2, 3],
      timeCapMins: 30,
      weekendNoLimit: false,
      cookingFor: 2,
      leftovers: true,
    };
    const result = await service.setShape('user1', shape);
    expect(repo.upsert).toHaveBeenCalledWith('user1', {
      planSlots: shape.slots,
      planDays: shape.days,
      timeCapMins: shape.timeCapMins,
      weekendNoLimit: shape.weekendNoLimit,
      cookingFor: shape.cookingFor,
      leftovers: shape.leftovers,
    });
    // An old client never sends fitTrainingDays: it is not written.
    expect(result).toEqual({ ...shape, fitTrainingDays: null });
  });

  // ─── Saved "Fit meals to training days" (T-06.7 follow-up) ────────────────

  it('getShape returns the saved fitTrainingDays, also next to a legacy shape', async () => {
    const legacy = makeRepo({
      findByUserId: vi.fn().mockResolvedValue({ planSlots: [], fitTrainingDays: false }),
    });
    expect((await new PlanShapeService(legacy).getShape('user1')).fitTrainingDays).toBe(false);
    const stored = makeRepo({
      findByUserId: vi.fn().mockResolvedValue({
        planSlots: ['dinner'],
        planDays: [0],
        timeCapMins: null,
        weekendNoLimit: false,
        cookingFor: null,
        leftovers: false,
        fitTrainingDays: true,
      }),
    });
    expect((await new PlanShapeService(stored).getShape('user1')).fitTrainingDays).toBe(true);
  });

  it('setShape writes fitTrainingDays when present (false, true or null to clear)', async () => {
    const base: PlanSettingsInput = {
      slots: ['dinner'],
      days: [0],
      timeCapMins: null,
      weekendNoLimit: false,
      cookingFor: null,
      leftovers: false,
    };
    for (const value of [false, true, null]) {
      const upsert = vi.fn().mockResolvedValue({ fitTrainingDays: value });
      const result = await new PlanShapeService(makeRepo({ upsert })).setShape('user1', {
        ...base,
        fitTrainingDays: value,
      });
      expect(upsert).toHaveBeenCalledWith(
        'user1',
        expect.objectContaining({ fitTrainingDays: value }),
      );
      expect(result.fitTrainingDays).toBe(value);
    }
  });

  it('setShape without fitTrainingDays (old clients) leaves the saved value alone', async () => {
    const upsert = vi
      .fn<Parameters<IDietaryPreferencesRepository['upsert']>>()
      .mockResolvedValue({ fitTrainingDays: false });
    const result = await new PlanShapeService(makeRepo({ upsert })).setShape('user1', {
      slots: ['lunch'],
      days: [1],
      timeCapMins: 15,
      weekendNoLimit: true,
      cookingFor: 1,
      leftovers: false,
    });
    const written = upsert.mock.calls[0]?.[1] ?? {};
    expect('fitTrainingDays' in written).toBe(false);
    // The response reports what is stored.
    expect(result.fitTrainingDays).toBe(false);
  });

  it('getFitTrainingDays: null when never chosen or no row', async () => {
    expect(await new PlanShapeService(makeRepo()).getFitTrainingDays('u')).toBeNull();
    const repo = makeRepo({ findByUserId: vi.fn().mockResolvedValue({ fitTrainingDays: false }) });
    expect(await new PlanShapeService(repo).getFitTrainingDays('u')).toBe(false);
  });
});
