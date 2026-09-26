import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/ai/index.js', () => ({ aiService: {} }));
vi.mock('@chefer/database', () => ({ prisma: {} }));

const { capacityRetryDelayMs } = await import('./ingredient-price.worker.js');

describe('capacityRetryDelayMs', () => {
  it('starts at 90 s, doubles per consecutive capacity failure, and caps at an hour', () => {
    expect(capacityRetryDelayMs(1)).toBe(90_000);
    expect(capacityRetryDelayMs(2)).toBe(180_000);
    expect(capacityRetryDelayMs(3)).toBe(360_000);
    expect(capacityRetryDelayMs(6)).toBe(2_880_000);
    expect(capacityRetryDelayMs(7)).toBe(3_600_000);
    expect(capacityRetryDelayMs(50)).toBe(3_600_000);
  });
});
