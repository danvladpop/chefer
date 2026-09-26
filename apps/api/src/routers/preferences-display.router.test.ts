import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { preferencesRouter } from './preferences.router.js';

// Backlog P2-6 / audit F-DASH-3-2: units + currency are editable on EVERY
// tier through setDisplayPreferences. The service is mocked, so these tests
// exercise the procedure's gating and zod input only.
const svc = vi.hoisted(() => ({
  setDisplayPreferences: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../application/preferences/preferences.service.js', () => ({
  preferencesService: svc,
  computeMacroTargets: vi.fn(),
}));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const freeUser: UserProfile = {
  id: 'u1',
  email: 'u@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const caller = preferencesRouter.createCaller({
  user: freeUser,
  requestId: 'test',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: false,
  res: {} as Response,
});

describe('preferences.setDisplayPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.setDisplayPreferences.mockResolvedValue({ preferredUnits: 'IMPERIAL', currency: 'USD' });
  });

  it('lets a FREE user change units and currency', async () => {
    const result = await caller.setDisplayPreferences({
      preferredUnits: 'IMPERIAL',
      currency: 'USD',
    });
    expect(result).toEqual({ preferredUnits: 'IMPERIAL', currency: 'USD' });
    expect(svc.setDisplayPreferences).toHaveBeenCalledWith('u1', {
      preferredUnits: 'IMPERIAL',
      currency: 'USD',
    });
  });

  it('accepts either field alone', async () => {
    await caller.setDisplayPreferences({ currency: 'RON' });
    await caller.setDisplayPreferences({ preferredUnits: 'METRIC' });
    expect(svc.setDisplayPreferences).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty update and unsupported values', async () => {
    await expect(caller.setDisplayPreferences({})).rejects.toThrow(/Nothing to update/);
    await expect(caller.setDisplayPreferences({ currency: 'JPY' as never })).rejects.toThrow();
    await expect(caller.setDisplayPreferences({ preferredUnits: 'US' as never })).rejects.toThrow();
    expect(svc.setDisplayPreferences).not.toHaveBeenCalled();
  });

  it('keeps updateTargets premium-only (units still accepted there for old apps)', async () => {
    await expect(caller.updateTargets({ preferredUnits: 'IMPERIAL' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(svc.update).not.toHaveBeenCalled();
  });
});
