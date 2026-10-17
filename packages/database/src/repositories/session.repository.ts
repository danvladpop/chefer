import { prisma } from '../client';

// ─── Auth sessions: retention ────────────────────────────────────────────────
// Sign-in and sign-out still write the table directly (auth.service.ts); this
// repository only serves the maintenance worker's daily prune.

export interface ISessionRepository {
  /** Deletes sessions whose `expires` is before `now`. Returns how many. */
  deleteExpired(now: Date): Promise<number>;
}

export class SessionRepository implements ISessionRepository {
  async deleteExpired(now: Date): Promise<number> {
    const { count } = await prisma.session.deleteMany({ where: { expires: { lt: now } } });
    return count;
  }
}

export const sessionRepository = new SessionRepository();
