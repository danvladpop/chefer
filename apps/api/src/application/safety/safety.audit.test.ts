import { describe, expect, it, vi } from 'vitest';
import { buildFilterAudit, safetyService } from './safety.service.js';

// T-26.7 — one structured `safety.filter` line per plan generation: counts and
// taxonomy rule ids, never names or user text.

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({ logger: log }));

describe('buildFilterAudit', () => {
  it('reports pool size, removed and taxonomy ids only', () => {
    const audit = buildFilterAudit({
      surface: 'plan.generate',
      poolSize: 40,
      kept: 31,
      prefs: {
        allergies: ['Peanuts', 'my-neighbour-Bob-is-allergic-to-cats'],
        dietaryRestrictions: ['Vegan'],
        dislikedIngredients: [],
      },
    });
    expect(audit).toMatchObject({
      event: 'safety.filter',
      surface: 'plan.generate',
      poolSize: 40,
      kept: 31,
      removed: 9,
    });
    expect(audit.ruleIds).toContain('unrecognised');
    expect(JSON.stringify(audit)).not.toMatch(/Bob|neighbour|Peanuts/);
  });

  it('never reports a negative removed count', () => {
    const audit = buildFilterAudit({
      surface: 's',
      poolSize: 3,
      kept: 5,
      prefs: { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] },
    });
    expect(audit.removed).toBe(0);
    expect(audit.ruleIds).toEqual([]);
  });
});

describe('SafetyService.logFilterAudit', () => {
  it('writes exactly one structured info line', async () => {
    safetyService.logFilterAudit({
      surface: 'plan.generate',
      poolSize: 10,
      kept: 10,
      prefs: { allergies: [], dietaryRestrictions: [], dislikedIngredients: [] },
    });
    await vi.waitFor(() => expect(log.info).toHaveBeenCalledTimes(1));
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'safety.filter', poolSize: 10, removed: 0 }),
      'safety.filter',
    );
  });
});
