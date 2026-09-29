import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@chefer/database';
import type { IUserRepository } from '../../infrastructure/prisma/prisma-user.repository.js';
import { consentService } from '../privacy/consent.service.js';
import { UserService } from './user.service.js';

vi.mock('../privacy/consent.service.js', () => ({
  consentService: { record: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseUser = {
  id: 'u1',
  email: 'alice@test.dev',
  name: 'Alice',
  firstName: 'Alice',
  lastName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
  passwordHash: null,
  emailVerified: null,
  aiDataConsentAt: null,
  emailDefaultsNoticeAt: null,
  weeklyEmailReady: true,
  weeklyEmailRecap: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
} as User;

function mockRepo(): { [K in keyof IUserRepository]: ReturnType<typeof vi.fn> } {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setAiDataConsent: vi.fn(),
    markEmailDefaultsNoticeShown: vi.fn(),
    findManyWithCount: vi.fn(),
    count: vi.fn(),
  };
}

let repo: ReturnType<typeof mockRepo>;
let service: UserService;

beforeEach(() => {
  repo = mockRepo();
  service = new UserService(repo as unknown as IUserRepository);
  vi.mocked(consentService.record).mockReset();
});

// ─── AI data consent (App Store 5.1.2(i)) ─────────────────────────────────────

describe('UserService.setAiDataConsent', () => {
  it('records the consent time when granting for the first time', async () => {
    repo.findById.mockResolvedValue(baseUser);
    repo.setAiDataConsent.mockImplementation(async (_id: string, at: Date | null) => ({
      ...baseUser,
      aiDataConsentAt: at,
    }));

    const result = await service.setAiDataConsent('u1', true);

    expect(repo.setAiDataConsent).toHaveBeenCalledWith('u1', expect.any(Date));
    expect(result.aiDataConsentAt).toBeInstanceOf(Date);
  });

  it('keeps the original timestamp when already granted (idempotent)', async () => {
    const grantedAt = new Date('2026-09-01T10:00:00Z');
    repo.findById.mockResolvedValue({ ...baseUser, aiDataConsentAt: grantedAt });

    const result = await service.setAiDataConsent('u1', true);

    expect(repo.setAiDataConsent).not.toHaveBeenCalled();
    expect(result.aiDataConsentAt).toEqual(grantedAt);
  });

  it('clears the consent on revoke', async () => {
    repo.findById.mockResolvedValue({ ...baseUser, aiDataConsentAt: new Date() });
    repo.setAiDataConsent.mockResolvedValue({ ...baseUser, aiDataConsentAt: null });

    const result = await service.setAiDataConsent('u1', false);

    expect(repo.setAiDataConsent).toHaveBeenCalledWith('u1', null);
    expect(result.aiDataConsentAt).toBeNull();
  });

  it('throws NOT_FOUND for an unknown user', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.setAiDataConsent('nope', true)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('logs a consent event on every real transition (§2.13) — grant then revoke = 2 rows', async () => {
    repo.findById.mockResolvedValueOnce(baseUser);
    repo.setAiDataConsent.mockResolvedValueOnce({ ...baseUser, aiDataConsentAt: new Date() });
    await service.setAiDataConsent('u1', true, 'mobile');

    repo.findById.mockResolvedValueOnce({ ...baseUser, aiDataConsentAt: new Date() });
    repo.setAiDataConsent.mockResolvedValueOnce({ ...baseUser, aiDataConsentAt: null });
    await service.setAiDataConsent('u1', false, 'mobile');

    expect(consentService.record).toHaveBeenCalledTimes(2);
    expect(consentService.record).toHaveBeenNthCalledWith(1, {
      userId: 'u1',
      kind: 'AI',
      granted: true,
      source: 'mobile',
    });
    expect(consentService.record).toHaveBeenNthCalledWith(2, {
      userId: 'u1',
      kind: 'AI',
      granted: false,
      source: 'mobile',
    });
  });

  it('does not log when the call is a no-op (already in that state)', async () => {
    repo.findById.mockResolvedValue({ ...baseUser, aiDataConsentAt: new Date() });
    await service.setAiDataConsent('u1', true);
    expect(consentService.record).not.toHaveBeenCalled();
  });
});

describe('UserService.dismissEmailDefaultsNotice (T-39.3)', () => {
  it('marks the notice shown for a user who has not seen it', async () => {
    repo.findById.mockResolvedValue({ ...baseUser, emailDefaultsNoticeAt: null });
    const shownAt = new Date('2026-09-28T10:00:00Z');
    repo.markEmailDefaultsNoticeShown.mockResolvedValue({
      ...baseUser,
      emailDefaultsNoticeAt: shownAt,
    });

    const result = await service.dismissEmailDefaultsNotice('u1');

    expect(repo.markEmailDefaultsNoticeShown).toHaveBeenCalledWith('u1');
    expect(result.emailDefaultsNoticeAt).toEqual(shownAt);
  });

  it('is idempotent: a second dismiss keeps the original timestamp', async () => {
    const shownAt = new Date('2026-09-28T10:00:00Z');
    repo.findById.mockResolvedValue({ ...baseUser, emailDefaultsNoticeAt: shownAt });

    const result = await service.dismissEmailDefaultsNotice('u1');

    expect(repo.markEmailDefaultsNoticeShown).not.toHaveBeenCalled();
    expect(result.emailDefaultsNoticeAt).toEqual(shownAt);
  });

  it('throws NOT_FOUND for an unknown user', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.dismissEmailDefaultsNotice('nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('UserService.findById', () => {
  it('exposes aiDataConsentAt on the current-user DTO', async () => {
    const grantedAt = new Date('2026-09-01T10:00:00Z');
    repo.findById.mockResolvedValue({ ...baseUser, aiDataConsentAt: grantedAt });

    const dto = await service.findById('u1');

    expect(dto?.aiDataConsentAt).toEqual(grantedAt);
    expect(dto).not.toHaveProperty('passwordHash');
  });

  it('exposes emailDefaultsNoticeAt on the current-user DTO (T-39.3)', async () => {
    const shownAt = new Date('2026-09-28T10:00:00Z');
    repo.findById.mockResolvedValue({ ...baseUser, emailDefaultsNoticeAt: shownAt });

    const dto = await service.findById('u1');

    expect(dto?.emailDefaultsNoticeAt).toEqual(shownAt);
  });

  it('defaults emailDefaultsNoticeAt to null when unset', async () => {
    repo.findById.mockResolvedValue({ ...baseUser, emailDefaultsNoticeAt: null });

    const dto = await service.findById('u1');

    expect(dto?.emailDefaultsNoticeAt).toBeNull();
  });
});
