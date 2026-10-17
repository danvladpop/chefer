import { describe, expect, it, vi } from 'vitest';
import { keepItSimple } from './coaching-content.service.js';

// PRD 2026-10 §4.3: the trainer sees a "Keep it simple" badge only when the
// simpleTraining flag is on AND the client chose the SIMPLE training style.

vi.mock('../../lib/env.js', () => ({ env: {} }));
const flag = vi.hoisted(() => ({ on: true }));
vi.mock('../../lib/flags.js', () => ({
  isFlagEnabled: (key: string) => key === 'simpleTraining' && flag.on,
}));

describe('keepItSimple', () => {
  it('SIMPLE with the flag on', () => {
    flag.on = true;
    expect(keepItSimple({ trainingStyle: 'SIMPLE' })).toBe(true);
    expect(keepItSimple({ trainingStyle: 'PROGRESSIVE' })).toBe(false);
    expect(keepItSimple(null)).toBe(false);
  });

  it('never while the flag is off, whatever the stored style', () => {
    flag.on = false;
    expect(keepItSimple({ trainingStyle: 'SIMPLE' })).toBe(false);
  });
});
