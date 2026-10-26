import { describe, expect, it, vi } from 'vitest';
import type { ClientRowDto } from '@chefer/types';
import { TrainerAlertsService, type TrainerAlertsDeps } from './trainer-alerts.service.js';

// Lane K4: the trainer's "went quiet" settings, the seen marker and the daily digest.

vi.mock('../../lib/env.js', () => ({ env: { APP_URL: 'https://app.test' } }));

const row = (name: string, over: Partial<ClientRowDto> = {}): ClientRowDto => ({
  clientId: name,
  name,
  since: '2026-10-01T09:00:00.000Z',
  label: null,
  lastWorkoutDate: null,
  week: { sessions: 0, goal: 3 },
  inactiveDays: 0,
  routineChangedByClientAt: null,
  quiet: false,
  quietDays: 0,
  ...over,
});

function setup(rows: ClientRowDto[]) {
  const deps: TrainerAlertsDeps = {
    trainers: {
      findActive: vi.fn(async () => ({ quietAfterDays: 3, quietDigestEmail: false }) as never),
      saveAlertsConfig: vi.fn(
        async (_id, d) =>
          ({ quietAfterDays: d.quietAfterDays, quietDigestEmail: d.quietDigestEmail }) as never,
      ),
      markQuietSeen: vi.fn(async () => undefined),
      listDigestRecipients: vi.fn(async () => [
        { userId: 'ana', email: 'ana@x.dev', firstName: 'Ana', quietAfterDays: 3 },
      ]),
    },
    links: { listClients: vi.fn(async () => rows) },
    claims: { claimEmail: vi.fn(async () => true), releaseEmail: vi.fn(async () => undefined) },
    email: { send: vi.fn(async () => undefined) },
    sendBudget: async () => null,
    appUrl: 'https://app.test',
    unsubscribeUrl: (u, s) => `https://app.test/unsubscribe?u=${u}&s=${s}`,
    now: () => new Date('2026-10-23T08:00:00Z'),
  };
  return { service: new TrainerAlertsService(deps), deps };
}

describe('TrainerAlertsService', () => {
  it('config round-trip and the seen marker', async () => {
    const { service, deps } = setup([]);
    expect(await service.config('ana')).toEqual({ quietAfterDays: 3, digestEmail: false });
    expect(await service.saveConfig('ana', { quietAfterDays: 5, digestEmail: true })).toEqual({
      quietAfterDays: 5,
      digestEmail: true,
    });
    await service.markSeen('ana');
    expect(deps.trainers.markQuietSeen).toHaveBeenCalledWith(
      'ana',
      new Date('2026-10-23T08:00:00Z'),
    );
  });

  it('digest: names and days of quiet clients only, most quiet first, once a day', async () => {
    const { service, deps } = setup([
      row('Maria', { quiet: true, quietDays: 4 }),
      row('Ion', { quiet: true, quietDays: 9 }),
      row('Dana'),
    ]);
    expect((await service.sendQuietDigests(new Date('2026-10-23T05:00:00Z'))).sent).toBe(0);
    const r = await service.sendQuietDigests(new Date('2026-10-23T08:00:00Z'));
    expect(r.sent).toBe(1);
    expect(deps.claims.claimEmail).toHaveBeenCalledWith(
      'ana',
      'COACHING_QUIET_DIGEST',
      new Date('2026-10-23T00:00:00Z'),
    );
    const message = vi.mocked(deps.email.send).mock.calls[0]?.[0];
    expect(message?.subject).toBe('2 clients went quiet');
    expect(message?.text).toMatch(
      /Ion: nothing logged for 9 days[\s\S]*Maria: nothing logged for 4 days/,
    );
    expect(message?.text).not.toMatch(/Dana|kcal|kg/);
    expect(message?.headers?.['List-Unsubscribe']).toContain('COACHING_QUIET_DIGEST');
  });

  it('nobody quiet: no email, no claim', async () => {
    const { service, deps } = setup([row('Dana')]);
    expect((await service.sendQuietDigests()).skipped).toBe(1);
    expect(deps.claims.claimEmail).not.toHaveBeenCalled();
    expect(deps.email.send).not.toHaveBeenCalled();
  });

  it('a failed send releases the claim for a later tick', async () => {
    const { service, deps } = setup([row('Maria', { quiet: true, quietDays: 4 })]);
    vi.mocked(deps.email.send).mockRejectedValueOnce(new Error('smtp down'));
    expect((await service.sendQuietDigests()).failed).toBe(1);
    expect(deps.claims.releaseEmail).toHaveBeenCalled();
  });
});
