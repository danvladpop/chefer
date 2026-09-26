// Audit F-GYM-2-1: the setup's equipment answer must hold end to end — the
// preview (gym.profile.recommend) and the routine actually written
// (templateToDays, used by completeSetup / createFromTemplate).
import { describe, expect, it, vi } from 'vitest';
import {
  EQUIPMENT_ACCESS_SETS,
  EXERCISE_BY_ID,
  PROGRAM_TEMPLATES,
  type GymEquipmentAccess,
  type TrainingExperience,
} from '@chefer/types';
import { GymProfileService } from './gym-profile.service.js';
import { templateToDays } from './routine.service.js';

const ACCESS: GymEquipmentAccess[] = ['FULL_GYM', 'DUMBBELLS', 'BODYWEIGHT'];
const EXPERIENCE: TrainingExperience[] = ['BEGINNER', 'INTERMEDIATE'];
const DAYS = [2, 3, 4, 5, 6];

function offEquipment(ids: string[], access: GymEquipmentAccess): string[] {
  return ids.filter((id) => {
    const e = EXERCISE_BY_ID.get(id);
    return !e || !EQUIPMENT_ACCESS_SETS[access].includes(e.equipment);
  });
}

// recommend() is pure; the repositories are never touched.
const service = new GymProfileService(
  {} as never,
  { get: vi.fn() },
  vi.fn(),
  { recompute: vi.fn() },
  { findForUser: vi.fn() },
  { upsert: vi.fn() },
);

describe('equipment answer is respected (F-GYM-2-1)', () => {
  const combos = DAYS.flatMap((days) =>
    EXPERIENCE.flatMap((experience) => ACCESS.map((access) => [days, experience, access] as const)),
  );

  it.each(combos)('recommend preview: %d days · %s · %s', (days, experience, equipmentAccess) => {
    const result = service.recommend({ days, experience, equipmentAccess });
    const ids = result.preview.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
    expect(ids.length).toBeGreaterThan(0);
    expect(offEquipment(ids, equipmentAccess)).toEqual([]);
    expect(result.hints.filter((h) => h.level === 'warning')).toEqual([]);
  });

  it('the routine written for every template and equipment answer matches the preview rule', () => {
    for (const t of PROGRAM_TEMPLATES) {
      for (const access of ACCESS) {
        const ids = templateToDays(t.key, access).days.flatMap((d) =>
          d.exercises.map((e) => e.exerciseId),
        );
        expect(offEquipment(ids, access), `${t.key} ${access}`).toEqual([]);
      }
    }
  });
});
