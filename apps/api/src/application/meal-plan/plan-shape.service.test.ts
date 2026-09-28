import { describe, expect, it, vi } from 'vitest';
import type { IDietaryPreferencesRepository } from '@chefer/database';
import { PlanShapeService, type PlanShapeWithLeftovers } from './plan-shape.service.js';

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
    });
  });

  it('setShape upserts every field (bug B-27: leftovers persists on the same row)', async () => {
    const repo = makeRepo();
    const service = new PlanShapeService(repo);
    const shape: PlanShapeWithLeftovers = {
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
    expect(result).toEqual(shape);
  });
});
