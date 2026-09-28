import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consentEventRepository } from '@chefer/database';
import { consentService } from './consent.service.js';

// ─── ConsentService (§2.13, T-39.2) ─────────────────────────────────────────

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    consentEventRepository: {
      record: vi.fn(),
      findAllByUser: vi.fn(),
      findLatestByKind: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConsentService', () => {
  it('record() appends through the repository, omitting undefined optional fields', async () => {
    vi.mocked(consentEventRepository.record).mockResolvedValue({ id: 'e1' } as never);

    await consentService.record({ userId: 'u1', kind: 'AI', granted: true, source: 'web' });

    expect(consentEventRepository.record).toHaveBeenCalledWith({
      userId: 'u1',
      kind: 'AI',
      granted: true,
      source: 'web',
    });
  });

  it('record() passes documentVersion and providers through when given', async () => {
    vi.mocked(consentEventRepository.record).mockResolvedValue({ id: 'e2' } as never);

    await consentService.record({
      userId: 'u1',
      kind: 'TERMS',
      granted: true,
      source: 'mobile',
      documentVersion: 'v3',
      providers: ['groq'],
    });

    expect(consentEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ documentVersion: 'v3', providers: ['groq'] }),
    );
  });

  it('history() reads the full log through the repository', async () => {
    vi.mocked(consentEventRepository.findAllByUser).mockResolvedValue([{ id: 'e1' }] as never);

    const result = await consentService.history('u1');

    expect(consentEventRepository.findAllByUser).toHaveBeenCalledWith('u1');
    expect(result).toEqual([{ id: 'e1' }]);
  });

  it('latest() reads the most recent event of one kind', async () => {
    vi.mocked(consentEventRepository.findLatestByKind).mockResolvedValue({ id: 'e3' } as never);

    const result = await consentService.latest('u1', 'HEALTH');

    expect(consentEventRepository.findLatestByKind).toHaveBeenCalledWith('u1', 'HEALTH');
    expect(result).toEqual({ id: 'e3' });
  });
});
