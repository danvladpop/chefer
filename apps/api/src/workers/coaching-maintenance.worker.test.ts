import { describe, expect, it, vi } from 'vitest';
import { COACHING_RETENTION } from '@chefer/types';
import {
  CoachingMaintenanceWorker,
  TEMPLATE_SOFT_DELETE_DAYS,
} from './coaching-maintenance.worker.js';

// Retention (spec §8.4, Q-6): invites 30 days after expiry, hidden notes after
// 30 days, ended links after 24 months. Once per UTC day; a failed step retries.

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// The default allowlist sweep (trainer-profile.service.ts → lib/env.ts); tests inject their own.
vi.mock('../application/coaching/trainer-profile.service.js', () => ({
  trainerProfileService: { enforceAllowlist: vi.fn() },
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-04T12:00:00Z');

function setup() {
  const invites = { deleteExpiredBefore: vi.fn(async () => 3) };
  const notes = { deleteHiddenBefore: vi.fn(async () => 2) };
  const links = { deleteEndedBefore: vi.fn(async () => 1) };
  const requests = {
    expireDue: vi.fn(async () => 4),
    deleteAnsweredBefore: vi.fn(async () => 5),
  };
  const trainers = {
    listActiveWithEmail: vi.fn(async () => [
      { userId: 't1', email: 'kept@x.dev' },
      { userId: 't2', email: 'removed@x.dev' },
    ]),
  };
  const templates = { purgeDeletedBefore: vi.fn(async () => 6) };
  const bookings = {
    deleteForEndedLinksBefore: vi.fn(async () => 7),
    deleteBlocksBefore: vi.fn(async () => 1),
  };
  const checkIns = { deleteOrphanedBefore: vi.fn(async () => 2) };
  const enforceAllowlist = vi.fn(async (u: { email: string }) => u.email === 'removed@x.dev');
  return {
    worker: new CoachingMaintenanceWorker({
      invites,
      notes,
      links,
      requests,
      trainers,
      templates,
      bookings,
      checkIns,
      enforceAllowlist,
    }),
    checkIns,
    templates,
    bookings,
    invites,
    notes,
    links,
    requests,
    enforceAllowlist,
  };
}

describe('CoachingMaintenanceWorker', () => {
  it('prunes with the retention constants and reports counts only', async () => {
    const { worker, invites, notes, links, requests, templates, bookings, enforceAllowlist } =
      setup();
    expect(await worker.tick(NOW)).toEqual({
      prunedInvites: 3,
      prunedNotes: 2,
      prunedLinks: 1,
      expiredRequests: 4,
      prunedRequests: 5,
      trainersRemoved: 1,
      prunedTemplates: 6,
      prunedBookings: 8,
      prunedCheckIns: 2,
    });
    // Trainer mode §10: bookings follow the link's 24 months; blocked time is kept 24 months too.
    expect(bookings.deleteForEndedLinksBefore).toHaveBeenCalledWith(
      new Date('2024-10-04T12:00:00Z'),
    );
    expect(bookings.deleteBlocksBefore).toHaveBeenCalledWith(new Date('2024-10-04T12:00:00Z'));
    // Deleted templates stay 30 days.
    expect(TEMPLATE_SOFT_DELETE_DAYS).toBe(30);
    expect(templates.purgeDeletedBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * DAY));
    expect(requests.expireDue).toHaveBeenCalledWith(expect.objectContaining({ now: NOW }));
    expect(requests.deleteAnsweredBefore).toHaveBeenCalledWith(
      new Date(NOW.getTime() - COACHING_RETENTION.requestAfterAnswerDays * DAY),
    );
    expect(enforceAllowlist).toHaveBeenCalledTimes(2);
    expect(invites.deleteExpiredBefore).toHaveBeenCalledWith(
      new Date(NOW.getTime() - COACHING_RETENTION.inviteAfterExpiryDays * DAY),
    );
    expect(notes.deleteHiddenBefore).toHaveBeenCalledWith(
      new Date(NOW.getTime() - COACHING_RETENTION.hiddenNoteDays * DAY),
    );
    expect(links.deleteEndedBefore).toHaveBeenCalledWith(new Date('2024-10-04T12:00:00Z'));
  });

  it('the retention defaults are the spec’s recommended ones (counsel still to confirm)', () => {
    expect(COACHING_RETENTION).toMatchObject({
      endedLinkMonths: 24,
      hiddenNoteDays: 30,
      inviteAfterExpiryDays: 30,
      clientExportIncludesTrainerNotes: false,
    });
  });

  it('runs once per UTC day', async () => {
    const { worker, invites } = setup();
    await worker.tick(NOW);
    expect(await worker.tick(new Date(NOW.getTime() + 3600_000))).toBeNull();
    expect(invites.deleteExpiredBefore).toHaveBeenCalledTimes(1);
    await worker.tick(new Date(NOW.getTime() + DAY));
    expect(invites.deleteExpiredBefore).toHaveBeenCalledTimes(2);
  });

  it('a failed step does not stop the others and the day is retried', async () => {
    const { worker, invites, notes, links } = setup();
    notes.deleteHiddenBefore.mockRejectedValueOnce(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = await worker.tick(NOW);
    expect(first).toMatchObject({ prunedInvites: 3, prunedNotes: 0, prunedLinks: 1 });
    expect(links.deleteEndedBefore).toHaveBeenCalled();
    // Same day, but the failed run did not mark it done: the next tick runs again.
    await worker.tick(new Date(NOW.getTime() + 60_000));
    expect(invites.deleteExpiredBefore).toHaveBeenCalledTimes(2);
    expect(notes.deleteHiddenBefore).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('ended links are kept while their bookings could not be pruned (retried next tick)', async () => {
    const { worker, bookings, links } = setup();
    bookings.deleteForEndedLinksBefore.mockRejectedValueOnce(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await worker.tick(NOW);
    expect(links.deleteEndedBefore).not.toHaveBeenCalled();
    await worker.tick(new Date(NOW.getTime() + 60_000));
    expect(links.deleteEndedBefore).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('a tick that overlaps a running one is skipped', async () => {
    const { worker, invites } = setup();
    let release: () => void = () => undefined;
    invites.deleteExpiredBefore.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(0);
        }),
    );
    const running = worker.tick(NOW);
    expect(await worker.tick(NOW)).toBeNull();
    release();
    await running;
  });
});
