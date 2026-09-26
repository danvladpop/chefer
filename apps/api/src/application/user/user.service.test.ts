import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@chefer/database';
import type { IUserRepository } from '../../infrastructure/prisma/prisma-user.repository.js';
import { UserService } from './user.service.js';

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
    findManyWithCount: vi.fn(),
    count: vi.fn(),
  };
}

let repo: ReturnType<typeof mockRepo>;
let service: UserService;

beforeEach(() => {
  repo = mockRepo();
  service = new UserService(repo as unknown as IUserRepository);
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
});

describe('UserService.findById', () => {
  it('exposes aiDataConsentAt on the current-user DTO', async () => {
    const grantedAt = new Date('2026-09-01T10:00:00Z');
    repo.findById.mockResolvedValue({ ...baseUser, aiDataConsentAt: grantedAt });

    const dto = await service.findById('u1');

    expect(dto?.aiDataConsentAt).toEqual(grantedAt);
    expect(dto).not.toHaveProperty('passwordHash');
  });
});
