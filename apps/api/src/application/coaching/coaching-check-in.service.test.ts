import { describe, expect, it, vi } from 'vitest';
import type { CoachingCheckIn, CoachingLink, TrainerProfile } from '@chefer/database';
import { CoachingCheckInService, type CoachingCheckInDeps } from './coaching-check-in.service.js';

// Lane K3: weekly check-ins. When one is open, what the client may answer, what
// the trainer reads, and the once-per-period email.

vi.mock('../../lib/env.js', () => ({ env: { APP_URL: 'https://app.test' } }));

const SUNDAY = '2026-10-25';
const link: CoachingLink = {
  id: 'link1',
  trainerId: 'ana',
  clientId: 'maria',
  status: 'ACTIVE',
  inviteCode: null,
  requestId: null,
  trainerLabel: null,
  startedAt: new Date('2026-10-01T09:00:00Z'),
  startedOn: '2026-10-01',
  endedAt: null,
  endedBy: null,
  consentCopyVersion: 2,
  shareFoodAt: null,
  shareWeightAt: null,
};
const profile = (over: Partial<TrainerProfile> = {}): TrainerProfile => ({
  userId: 'ana',
  displayName: 'Ana',
  gymLine: null,
  activatedAt: new Date('2026-09-01T09:00:00Z'),
  disabledAt: null,
  checkInEnabled: true,
  checkInDay: 6,
  checkInQuestions: ['ENERGY', 'SLEEP'],
  quietAfterDays: 3,
  quietDigestEmail: false,
  quietSeenAt: null,
  ...over,
});

function setup(opts: { profile?: TrainerProfile | null; existing?: CoachingCheckIn | null } = {}) {
  const rows: CoachingCheckIn[] = opts.existing ? [opts.existing] : [];
  const deps: CoachingCheckInDeps = {
    checkIns: {
      find: vi.fn(async () => opts.existing ?? null),
      upsert: vi.fn(async (d) => ({
        checkIn: {
          id: 'c1',
          trainerId: d.trainerId,
          clientId: d.clientId,
          periodStart: d.periodStart,
          questions: d.questions,
          answers: d.answers,
          note: d.note,
          submittedAt: d.now,
        },
        created: !opts.existing,
      })),
      listForPair: vi.fn(async () => rows),
      findEmailRecipients: vi.fn(async () => [
        {
          trainerId: 'ana',
          trainerName: 'Ana',
          clientId: 'maria',
          email: 'm@x.dev',
          firstName: 'Maria',
        },
      ]),
      claimEmail: vi.fn(async () => true),
      releaseEmail: vi.fn(async () => undefined),
      deleteOrphanedBefore: vi.fn(),
    },
    links: { findActiveForClient: vi.fn(async () => link) },
    trainers: {
      find: vi.fn(async () => (opts.profile === undefined ? profile() : opts.profile)),
      findActive: vi.fn(async () => (opts.profile === undefined ? profile() : opts.profile)),
      saveCheckInConfig: vi.fn(async (_id, d) =>
        profile({
          checkInEnabled: d.enabled,
          checkInDay: d.day,
          checkInQuestions: d.questions,
          quietAfterDays: 3,
          quietDigestEmail: false,
          quietSeenAt: null,
        }),
      ),
    },
    email: { send: vi.fn(async () => undefined) },
    sendBudget: async () => null,
    appUrl: 'https://app.test',
    unsubscribeUrl: (u, s) => `https://app.test/unsubscribe?u=${u}&s=${s}`,
    now: () => new Date('2026-10-25T09:30:00Z'),
  };
  return { service: new CoachingCheckInService(deps), deps };
}

describe('client: the open check-in', () => {
  it('opens on the trainer’s weekday and asks the trainer’s questions', async () => {
    const { service } = setup();
    expect(await service.current('maria', SUNDAY)).toEqual({
      periodStart: SUNDAY,
      trainerName: 'Ana',
      questions: ['ENERGY', 'SLEEP'],
      answered: null,
    });
    // Still the same one on Wednesday.
    expect((await service.current('maria', '2026-10-28'))?.periodStart).toBe(SUNDAY);
  });

  it('nothing while check-ins are off or there is no trainer', async () => {
    expect(
      await setup({ profile: profile({ checkInEnabled: false }) }).service.current('maria', SUNDAY),
    ).toBeNull();
    const { service, deps } = setup();
    vi.mocked(deps.links.findActiveForClient).mockResolvedValue(null);
    expect(await service.current('maria', SUNDAY)).toBeNull();
  });

  it('submit needs the open period and every question 1–5; the note is trimmed', async () => {
    const { service, deps } = setup();
    await expect(
      service.submit('maria', {
        today: SUNDAY,
        periodStart: '2026-10-18',
        answers: { ENERGY: 3, SLEEP: 4 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      service.submit('maria', { today: SUNDAY, periodStart: SUNDAY, answers: { ENERGY: 3 } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const { checkIn, edit } = await service.submit('maria', {
      today: SUNDAY,
      periodStart: SUNDAY,
      answers: { ENERGY: 3, SLEEP: 4 },
      note: '  Slept badly midweek  ',
    });
    expect(edit).toBe(false);
    expect(checkIn.answered).toMatchObject({
      answers: { ENERGY: 3, SLEEP: 4 },
      note: 'Slept badly midweek',
    });
    expect(deps.checkIns.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ trainerId: 'ana', clientId: 'maria', periodStart: SUNDAY }),
    );
  });

  it('an answered check-in keeps the questions it was answered with', async () => {
    const existing: CoachingCheckIn = {
      id: 'c1',
      trainerId: 'ana',
      clientId: 'maria',
      periodStart: SUNDAY,
      questions: ['MOOD'],
      answers: { MOOD: 5 },
      note: null,
      submittedAt: new Date('2026-10-25T10:00:00Z'),
    };
    const open = await setup({ existing }).service.current('maria', SUNDAY);
    expect(open?.questions).toEqual(['MOOD']);
    expect(open?.answered?.answers).toEqual({ MOOD: 5 });
  });
});

describe('trainer', () => {
  it('reads the history and whether this week’s is answered', async () => {
    const existing: CoachingCheckIn = {
      id: 'c1',
      trainerId: 'ana',
      clientId: 'maria',
      periodStart: SUNDAY,
      questions: ['ENERGY', 'SLEEP'],
      answers: { ENERGY: 2, SLEEP: 4, BOGUS: 9 },
      note: 'Tired',
      submittedAt: new Date('2026-10-25T10:00:00Z'),
    };
    const { service } = setup({ existing });
    const out = await service.forClient(
      { trainerId: 'ana', clientId: 'maria', scope: 'read', link },
      '2026-10-26',
    );
    expect(out).toMatchObject({ enabled: true, current: { periodStart: SUNDAY, answered: true } });
    expect(out.items[0]?.answers).toEqual({ ENERGY: 2, SLEEP: 4 });
  });

  it('saves the config', async () => {
    const { service } = setup();
    expect(
      await service.saveConfig('ana', { enabled: true, day: 0, questions: ['HUNGER'] }),
    ).toEqual({ enabled: true, day: 0, questions: ['HUNGER'] });
  });
});

describe('email sweep', () => {
  it('emails once per period with a one-click unsubscribe, not before the hour', async () => {
    const { service, deps } = setup();
    expect((await service.sendCheckInEmails(new Date('2026-10-25T06:00:00Z'))).sent).toBe(0);
    const r = await service.sendCheckInEmails(new Date('2026-10-25T09:00:00Z'));
    expect(r.sent).toBe(1);
    expect(deps.checkIns.findEmailRecipients).toHaveBeenCalledWith({
      day: 6,
      kind: 'COACHING_CHECK_IN',
      claimDate: new Date('2026-10-25T00:00:00Z'),
    });
    const message = vi.mocked(deps.email.send).mock.calls[0]?.[0];
    expect(message?.subject).toBe('Ana’s weekly check-in');
    expect(message?.headers?.['List-Unsubscribe']).toContain('COACHING_CHECK_IN');
    expect(message?.text).not.toMatch(/ENERGY|SLEEP/);
  });

  it('a claimed period is skipped; a failed send releases its claim', async () => {
    const { service, deps } = setup();
    vi.mocked(deps.checkIns.claimEmail).mockResolvedValueOnce(false);
    expect((await service.sendCheckInEmails(new Date('2026-10-25T09:00:00Z'))).skipped).toBe(1);
    vi.mocked(deps.email.send).mockRejectedValueOnce(new Error('smtp down'));
    const r = await service.sendCheckInEmails(new Date('2026-10-25T09:00:00Z'));
    expect(r.failed).toBe(1);
    expect(deps.checkIns.releaseEmail).toHaveBeenCalled();
  });
});
